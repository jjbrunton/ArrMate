import { createHash, randomUUID, timingSafeEqual } from "crypto";
import { eq, lt, ne } from "drizzle-orm";
import { getDb } from "../db";
import { authAdmin, authLoginAttempts, authSessions, instances } from "../db/schema";
import { getAuthEnvironmentStatus } from "../auth/config";
import { encrypt } from "../crypto";
import { hashPassword, isSupportedPasswordHash, verifyPassword } from "../auth/password";
import { createSessionToken, hashSessionToken } from "../auth/session";
import { verifyInstanceConnection } from "../instances/connection";
import type { InstanceType } from "../instances/definitions";
import { DEFAULT_QUALITY_CHECK_STRATEGY } from "../quality-check-strategy";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
const AUTH_ADMIN_ROW_ID = 1;

export interface AuthenticatedSession {
  id: string;
  expiresAt: string;
}

export interface AuthAccount {
  username: string;
}

export interface AuthConfigurationStatus {
  configured: boolean;
  canSetInitialAdmin: boolean;
  message?: string;
}

export interface InitialAdminInstanceInput {
  name: string;
  type: InstanceType;
  baseUrl: string;
  apiKey: string;
}

export type LoginResult =
  | {
      ok: true;
      session: AuthenticatedSession;
      sessionToken: string;
      expiresAt: Date;
    }
  | {
      ok: false;
      reason: "not_configured" | "invalid_credentials" | "rate_limited";
      retryAfterSeconds?: number;
      message: string;
    };

export type InitialAdminSetupResult =
  | {
      ok: true;
      session: AuthenticatedSession;
      sessionToken: string;
      expiresAt: Date;
      instanceCreated: boolean;
      createdInstanceId: number | null;
    }
  | {
      ok: false;
      reason: "already_configured" | "environment_invalid";
      message: string;
    };

export type ChangeAdminPasswordResult =
  | {
      ok: true;
      username: string;
    }
  | {
      ok: false;
      reason: "not_configured" | "invalid_credentials";
      message: string;
    };

function now() {
  return new Date();
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest();
}

function safeEqual(a: string, b: string) {
  return timingSafeEqual(sha256(a), sha256(b));
}

function getStoredAdminCredentials() {
  return getDb().select().from(authAdmin).where(eq(authAdmin.id, AUTH_ADMIN_ROW_ID)).get() ?? null;
}

export function getAdminAccount(): AuthAccount | null {
  const configuredAdmin = getStoredAdminCredentials();

  if (!configuredAdmin) {
    return null;
  }

  return {
    username: configuredAdmin.username,
  };
}

function verifyStoredCredentials(username: string, password: string): boolean {
  const configuredAdmin = getStoredAdminCredentials();

  if (!configuredAdmin || !isSupportedPasswordHash(configuredAdmin.passwordHash)) {
    return false;
  }

  return safeEqual(username.trim(), configuredAdmin.username) && verifyPassword(password, configuredAdmin.passwordHash);
}

function cleanupExpiredSessions(reference = now()) {
  getDb().delete(authSessions).where(lt(authSessions.expiresAt, reference.toISOString())).run();
}

function getAttemptWindow(ipAddress: string, reference = now()) {
  const db = getDb();
  const existing = db.select().from(authLoginAttempts).where(eq(authLoginAttempts.ipAddress, ipAddress)).get();

  if (!existing) {
    return null;
  }

  if (existing.blockedUntil && new Date(existing.blockedUntil) > reference) {
    return existing;
  }

  if (reference.getTime() - new Date(existing.lastFailedAt).getTime() > LOGIN_WINDOW_MS) {
    db.delete(authLoginAttempts).where(eq(authLoginAttempts.ipAddress, ipAddress)).run();
    return null;
  }

  return existing;
}

function clearFailedLoginAttempts(ipAddress: string) {
  getDb().delete(authLoginAttempts).where(eq(authLoginAttempts.ipAddress, ipAddress)).run();
}

function recordFailedLoginAttempt(ipAddress: string, reference = now()) {
  const db = getDb();
  const existing = getAttemptWindow(ipAddress, reference);
  const nextCount = (existing?.failureCount ?? 0) + 1;
  const blockedUntil =
    nextCount >= MAX_FAILED_ATTEMPTS
      ? new Date(reference.getTime() + LOGIN_BLOCK_MS).toISOString()
      : null;

  db
    .insert(authLoginAttempts)
    .values({
      ipAddress,
      failureCount: nextCount,
      firstFailedAt: existing?.firstFailedAt ?? reference.toISOString(),
      lastFailedAt: reference.toISOString(),
      blockedUntil,
    })
    .onConflictDoUpdate({
      target: authLoginAttempts.ipAddress,
      set: {
        failureCount: nextCount,
        lastFailedAt: reference.toISOString(),
        blockedUntil,
      },
    })
    .run();
}

export function getAuthConfigurationStatus(): AuthConfigurationStatus {
  const environment = getAuthEnvironmentStatus();

  if (!environment.ready) {
    return {
      configured: false,
      canSetInitialAdmin: false,
      message: environment.message ?? "Authentication environment is not configured",
    };
  }

  const configuredAdmin = getStoredAdminCredentials();

  if (!configuredAdmin) {
    return {
      configured: false,
      canSetInitialAdmin: true,
      message: "Administrator account has not been created yet.",
    };
  }

  if (!configuredAdmin.username.trim() || !isSupportedPasswordHash(configuredAdmin.passwordHash)) {
    return {
      configured: false,
      canSetInitialAdmin: false,
      message: "Stored administrator credentials are invalid.",
    };
  }

  return {
    configured: true,
    canSetInitialAdmin: false,
  };
}

export function authenticateAdmin(input: {
  username: string;
  password: string;
  ipAddress: string;
  userAgent?: string | null;
}): LoginResult {
  const configStatus = getAuthConfigurationStatus();

  if (!configStatus.configured) {
    return {
      ok: false,
      reason: "not_configured",
      message: configStatus.message ?? "Authentication is not configured",
    };
  }

  cleanupExpiredSessions();

  const reference = now();
  const existingAttempt = getAttemptWindow(input.ipAddress, reference);

  if (existingAttempt?.blockedUntil && new Date(existingAttempt.blockedUntil) > reference) {
    const retryAfterMs = new Date(existingAttempt.blockedUntil).getTime() - reference.getTime();

    return {
      ok: false,
      reason: "rate_limited",
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      message: "Too many failed login attempts. Try again later.",
    };
  }

  if (!verifyStoredCredentials(input.username, input.password)) {
    recordFailedLoginAttempt(input.ipAddress, reference);

    return {
      ok: false,
      reason: "invalid_credentials",
      message: "Invalid credentials",
    };
  }

  clearFailedLoginAttempts(input.ipAddress);

  const sessionToken = createSessionToken();
  const expiresAt = new Date(reference.getTime() + SESSION_TTL_MS);
  const session = {
    id: randomUUID(),
    tokenHash: hashSessionToken(sessionToken),
    ipAddress: input.ipAddress,
    userAgent: input.userAgent ?? null,
    createdAt: reference.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  getDb().insert(authSessions).values(session).run();

  return {
    ok: true,
    session: {
      id: session.id,
      expiresAt: session.expiresAt,
    },
    sessionToken,
    expiresAt,
  };
}

export async function setupInitialAdmin(input: {
  username: string;
  password: string;
  ipAddress: string;
  userAgent?: string | null;
  firstInstance?: InitialAdminInstanceInput;
}): Promise<InitialAdminSetupResult> {
  const configStatus = getAuthConfigurationStatus();

  if (configStatus.configured) {
    return {
      ok: false,
      reason: "already_configured",
      message: "Administrator account is already configured",
    };
  }

  if (!configStatus.canSetInitialAdmin) {
    return {
      ok: false,
      reason: "environment_invalid",
      message: configStatus.message ?? "Authentication environment is not ready",
    };
  }

  const normalizedInstance = input.firstInstance
    ? {
        ...input.firstInstance,
        baseUrl: input.firstInstance.baseUrl.replace(/\/+$/, ""),
      }
    : undefined;

  if (normalizedInstance) {
    await verifyInstanceConnection(
      normalizedInstance.type,
      normalizedInstance.baseUrl,
      normalizedInstance.apiKey,
    );
  }

  cleanupExpiredSessions();
  clearFailedLoginAttempts(input.ipAddress);

  const reference = now();
  const sessionToken = createSessionToken();
  const expiresAt = new Date(reference.getTime() + SESSION_TTL_MS);
  const session = {
    id: randomUUID(),
    tokenHash: hashSessionToken(sessionToken),
    ipAddress: input.ipAddress,
    userAgent: input.userAgent ?? null,
    createdAt: reference.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  let createdInstance = false;
  let createdInstanceId: number | null = null;
  let createdAdmin = false;
  const db = getDb();

  try {
    const existingAdmin = db.select().from(authAdmin).where(eq(authAdmin.id, AUTH_ADMIN_ROW_ID)).get();

    if (existingAdmin) {
      return {
        ok: false,
        reason: "already_configured",
        message: "Administrator account is already configured",
      };
    }

    db.insert(authAdmin).values({
      id: AUTH_ADMIN_ROW_ID,
      username: input.username.trim(),
      passwordHash: hashPassword(input.password),
      createdAt: reference.toISOString(),
      updatedAt: reference.toISOString(),
    }).run();
    createdAdmin = true;

    if (normalizedInstance) {
      const insertedInstance = db.insert(instances).values({
          name: normalizedInstance.name,
          type: normalizedInstance.type,
          baseUrl: normalizedInstance.baseUrl,
          apiKey: encrypt(normalizedInstance.apiKey),
          pollIntervalSeconds: 300,
          qualityCheckIntervalSeconds: 1800,
          qualityCheckMaxItems: 50,
          qualityCheckStrategy: DEFAULT_QUALITY_CHECK_STRATEGY,
          mediaSyncIntervalSeconds: 3600,
          requestSyncIntervalSeconds: normalizedInstance.type === "overseerr" ? 300 : null,
          autoFix: false,
        }).returning({ id: instances.id }).get();
      createdInstanceId = insertedInstance.id;
      createdInstance = true;
    }

    db.insert(authSessions).values(session).run();
  } catch (err) {
    if (createdInstanceId !== null) {
      db.delete(instances).where(eq(instances.id, createdInstanceId)).run();
    }

    if (createdAdmin) {
      db.delete(authAdmin).where(eq(authAdmin.id, AUTH_ADMIN_ROW_ID)).run();
    }

    throw err;
  }

  return {
    ok: true,
    session: {
      id: session.id,
      expiresAt: session.expiresAt,
    },
    sessionToken,
    expiresAt,
    instanceCreated: createdInstance,
    createdInstanceId,
  };
}

export function getAuthenticatedSession(token: string | undefined | null): AuthenticatedSession | null {
  if (!token) {
    return null;
  }

  try {
    cleanupExpiredSessions();
  } catch {
    return null;
  }

  const session = getDb()
    .select()
    .from(authSessions)
    .where(eq(authSessions.tokenHash, hashSessionToken(token)))
    .get();

  if (!session) {
    return null;
  }

  return {
    id: session.id,
    expiresAt: session.expiresAt,
  };
}

export function revokeAuthenticatedSession(token: string | undefined | null) {
  if (!token) {
    return;
  }

  try {
    getDb().delete(authSessions).where(eq(authSessions.tokenHash, hashSessionToken(token))).run();
  } catch {
    // Ignore invalid auth environment during logout cleanup.
  }
}

export function changeAdminPassword(input: {
  currentPassword: string;
  newPassword: string;
  sessionToken?: string | null;
}): ChangeAdminPasswordResult {
  const configStatus = getAuthConfigurationStatus();

  if (!configStatus.configured) {
    return {
      ok: false,
      reason: "not_configured",
      message: configStatus.message ?? "Authentication is not configured",
    };
  }

  const configuredAdmin = getStoredAdminCredentials();

  if (!configuredAdmin || !verifyPassword(input.currentPassword, configuredAdmin.passwordHash)) {
    return {
      ok: false,
      reason: "invalid_credentials",
      message: "Current password is incorrect",
    };
  }

  const db = getDb();
  const reference = now().toISOString();

  db.update(authAdmin)
    .set({
      passwordHash: hashPassword(input.newPassword),
      updatedAt: reference,
    })
    .where(eq(authAdmin.id, AUTH_ADMIN_ROW_ID))
    .run();

  if (input.sessionToken) {
    db.delete(authSessions)
      .where(ne(authSessions.tokenHash, hashSessionToken(input.sessionToken)))
      .run();
  } else {
    db.delete(authSessions).run();
  }

  return {
    ok: true,
    username: configuredAdmin.username,
  };
}
