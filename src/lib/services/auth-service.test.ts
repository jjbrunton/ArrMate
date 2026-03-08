import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";

let testDb: ReturnType<typeof drizzle>;
let sqlite: InstanceType<typeof Database>;

vi.mock("../db", () => ({
  getDb: () => testDb,
}));

vi.mock("../crypto", () => ({
  encrypt: (value: string) => `encrypted:${value}`,
}));

vi.mock("../instances/connection", () => ({
  verifyInstanceConnection: vi.fn().mockResolvedValue({
    appName: "Overseerr",
    version: "1.0.0",
  }),
}));

const CREATE_SQL = `
  CREATE TABLE IF NOT EXISTS auth_admin (
    id INTEGER PRIMARY KEY NOT NULL,
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS auth_sessions (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    ip_address TEXT,
    user_agent TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS auth_login_attempts (
    ip_address TEXT PRIMARY KEY,
    failure_count INTEGER NOT NULL DEFAULT 0,
    first_failed_at TEXT NOT NULL,
    last_failed_at TEXT NOT NULL,
    blocked_until TEXT
  );

  CREATE TABLE IF NOT EXISTS instances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_key TEXT NOT NULL,
    poll_interval_seconds INTEGER NOT NULL DEFAULT 300,
    quality_check_max_items INTEGER NOT NULL DEFAULT 50,
    enabled INTEGER NOT NULL DEFAULT 1,
    auto_fix INTEGER NOT NULL DEFAULT 0,
    last_health_check TEXT,
    last_health_status TEXT DEFAULT 'unknown',
    last_polled_at TEXT,
    last_quality_check_at TEXT,
    media_sync_interval_seconds INTEGER NOT NULL DEFAULT 3600,
    last_media_sync_at TEXT,
    request_sync_interval_seconds INTEGER,
    last_request_sync_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

function setupDb() {
  sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  testDb = drizzle(sqlite, { schema });
  sqlite.exec(CREATE_SQL);
}

describe("auth-service", () => {
  const originalSessionSecret = process.env.AUTH_SESSION_SECRET;

  beforeEach(() => {
    setupDb();
    process.env.AUTH_SESSION_SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  afterAll(() => {
    if (originalSessionSecret === undefined) {
      delete process.env.AUTH_SESSION_SECRET;
    } else {
      process.env.AUTH_SESSION_SECRET = originalSessionSecret;
    }
  });

  it("reports onboarding required before the initial admin is created", async () => {
    const { authenticateAdmin, getAuthConfigurationStatus } = await import("./auth-service");

    expect(getAuthConfigurationStatus()).toEqual({
      configured: false,
      canSetInitialAdmin: true,
      message: "Administrator account has not been created yet.",
    });

    const result = authenticateAdmin({
      username: "admin",
      password: "letmein",
      ipAddress: "127.0.0.1",
    });

    expect(result).toMatchObject({
      ok: false,
      reason: "not_configured",
    });
  });

  it("creates the initial admin and logs the user in", async () => {
    const { getAuthenticatedSession, setupInitialAdmin } = await import("./auth-service");

    const result = await setupInitialAdmin({
      username: "admin",
      password: "letmein123",
      ipAddress: "127.0.0.1",
      userAgent: "Vitest",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error("Expected setup to succeed");
    }

    expect(result.instanceCreated).toBe(false);
    expect(getAuthenticatedSession(result.sessionToken)).toEqual({
      id: result.session.id,
      expiresAt: result.session.expiresAt,
    });
  });

  it("can create an Overseerr instance during onboarding", async () => {
    const { setupInitialAdmin } = await import("./auth-service");

    const result = await setupInitialAdmin({
      username: "admin",
      password: "letmein123",
      ipAddress: "127.0.0.1",
      firstInstance: {
        name: "Requests",
        type: "overseerr",
        baseUrl: "http://localhost:5055",
        apiKey: "abc123",
      },
    });

    expect(result).toMatchObject({
      ok: true,
      instanceCreated: true,
    });

    const savedInstance = testDb.select().from(schema.instances).get();
    expect(savedInstance).toMatchObject({
      name: "Requests",
      type: "overseerr",
      requestSyncIntervalSeconds: 300,
    });
  });

  it("authenticates against the stored admin credentials", async () => {
    const { authenticateAdmin, setupInitialAdmin } = await import("./auth-service");

    await setupInitialAdmin({
      username: "admin",
      password: "letmein123",
      ipAddress: "127.0.0.1",
    });

    const result = authenticateAdmin({
      username: "admin",
      password: "letmein123",
      ipAddress: "127.0.0.1",
    });

    expect(result.ok).toBe(true);
  });

  it("returns the configured admin username", async () => {
    const { getAdminAccount, setupInitialAdmin } = await import("./auth-service");

    await setupInitialAdmin({
      username: "actual-admin",
      password: "letmein123",
      ipAddress: "127.0.0.1",
    });

    expect(getAdminAccount()).toEqual({
      username: "actual-admin",
    });
  });

  it("changes the admin password and invalidates other sessions", async () => {
    const {
      authenticateAdmin,
      changeAdminPassword,
      getAuthenticatedSession,
      setupInitialAdmin,
    } = await import("./auth-service");

    await setupInitialAdmin({
      username: "admin",
      password: "letmein123",
      ipAddress: "127.0.0.1",
    });

    const currentSession = authenticateAdmin({
      username: "admin",
      password: "letmein123",
      ipAddress: "127.0.0.1",
    });
    const otherSession = authenticateAdmin({
      username: "admin",
      password: "letmein123",
      ipAddress: "127.0.0.2",
    });

    if (!currentSession.ok || !otherSession.ok) {
      throw new Error("Expected both logins to succeed");
    }

    expect(changeAdminPassword({
      currentPassword: "letmein123",
      newPassword: "new-password-456",
      sessionToken: currentSession.sessionToken,
    })).toEqual({
      ok: true,
      username: "admin",
    });

    expect(getAuthenticatedSession(currentSession.sessionToken)).toEqual({
      id: currentSession.session.id,
      expiresAt: currentSession.session.expiresAt,
    });
    expect(getAuthenticatedSession(otherSession.sessionToken)).toBeNull();

    const oldPasswordLogin = authenticateAdmin({
      username: "admin",
      password: "letmein123",
      ipAddress: "127.0.0.3",
    });
    const newPasswordLogin = authenticateAdmin({
      username: "admin",
      password: "new-password-456",
      ipAddress: "127.0.0.4",
    });

    expect(oldPasswordLogin).toMatchObject({
      ok: false,
      reason: "invalid_credentials",
    });
    expect(newPasswordLogin.ok).toBe(true);
  });

  it("rejects password changes when the current password is wrong", async () => {
    const { changeAdminPassword, setupInitialAdmin } = await import("./auth-service");

    await setupInitialAdmin({
      username: "admin",
      password: "letmein123",
      ipAddress: "127.0.0.1",
    });

    expect(changeAdminPassword({
      currentPassword: "wrong-password",
      newPassword: "new-password-456",
    })).toEqual({
      ok: false,
      reason: "invalid_credentials",
      message: "Current password is incorrect",
    });
  });

  it("rate limits repeated failed login attempts", async () => {
    const { authenticateAdmin, setupInitialAdmin } = await import("./auth-service");

    await setupInitialAdmin({
      username: "admin",
      password: "letmein123",
      ipAddress: "127.0.0.1",
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      authenticateAdmin({
        username: "admin",
        password: "wrong",
        ipAddress: "127.0.0.1",
      });
    }

    const result = authenticateAdmin({
      username: "admin",
      password: "letmein",
      ipAddress: "127.0.0.1",
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected login to be blocked");
    }

    expect(result.reason).toBe("rate_limited");
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("revokes sessions", async () => {
    const { authenticateAdmin, getAuthenticatedSession, revokeAuthenticatedSession, setupInitialAdmin } = await import("./auth-service");

    await setupInitialAdmin({
      username: "admin",
      password: "letmein123",
      ipAddress: "127.0.0.1",
    });

    const login = authenticateAdmin({
      username: "admin",
      password: "letmein123",
      ipAddress: "127.0.0.1",
    });

    if (!login.ok) {
      throw new Error("Expected login to succeed");
    }

    revokeAuthenticatedSession(login.sessionToken);

    expect(getAuthenticatedSession(login.sessionToken)).toBeNull();
  });

  it("rejects a second onboarding attempt after credentials exist", async () => {
    const { setupInitialAdmin } = await import("./auth-service");

    await setupInitialAdmin({
      username: "admin",
      password: "letmein123",
      ipAddress: "127.0.0.1",
    });

    const secondAttempt = await setupInitialAdmin({
      username: "other-admin",
      password: "different-password",
      ipAddress: "127.0.0.2",
    });

    expect(secondAttempt).toMatchObject({
      ok: false,
      reason: "already_configured",
    });
  });
});
