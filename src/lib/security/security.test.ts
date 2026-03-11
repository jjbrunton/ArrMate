import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "crypto";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";

// ---------------------------------------------------------------------------
// Test database setup
// ---------------------------------------------------------------------------

let testDb: ReturnType<typeof drizzle>;
let sqlite: InstanceType<typeof Database>;

vi.mock("../db", () => ({
  getDb: () => testDb,
}));

// Crypto is NOT mocked — tests need real encryption for integrity checks.
// However we need to stub the persistent-secret helpers so the crypto module
// doesn't touch the filesystem.
const TEST_KEY = randomBytes(32).toString("hex");

vi.mock("../config/persistent-secret", () => ({
  getOrCreatePersistentHexSecret: () => TEST_KEY,
  readPersistentHexSecret: () => TEST_KEY,
  writePersistentHexSecret: () => TEST_KEY,
  removePersistentHexSecret: () => {},
}));

vi.mock("../instances/connection", () => ({
  verifyInstanceConnection: vi.fn().mockResolvedValue({
    appName: "Radarr",
    version: "5.0",
    urlBase: "",
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
    quality_check_interval_seconds INTEGER NOT NULL DEFAULT 1800,
    quality_check_max_items INTEGER NOT NULL DEFAULT 50,
    quality_check_strategy TEXT NOT NULL DEFAULT 'oldest_search',
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Security Regression Tests", () => {
  const originalSessionSecret = process.env.AUTH_SESSION_SECRET;

  beforeEach(() => {
    setupDb();
    process.env.AUTH_SESSION_SECRET =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  afterAll(() => {
    if (originalSessionSecret === undefined) {
      delete process.env.AUTH_SESSION_SECRET;
    } else {
      process.env.AUTH_SESSION_SECRET = originalSessionSecret;
    }
  });

  // -----------------------------------------------------------------------
  // 1. Encryption Integrity
  // -----------------------------------------------------------------------
  describe("encryption integrity", () => {
    it("produces different ciphertexts for the same plaintext (unique IVs)", async () => {
      const { encrypt } = await import("../crypto");

      const a = encrypt("my-secret-api-key");
      const b = encrypt("my-secret-api-key");

      expect(a).not.toBe(b);
    });

    it("ciphertext contains no substring of the plaintext", async () => {
      const { encrypt } = await import("../crypto");
      const plaintext = "super-secret-radarr-key-12345";

      const ciphertext = encrypt(plaintext);

      // Check that no 8+ char substring of the plaintext appears in the ciphertext
      for (let i = 0; i <= plaintext.length - 8; i++) {
        expect(ciphertext).not.toContain(plaintext.substring(i, i + 8));
      }
    });

    it("tampered ciphertext causes decryption to throw (GCM auth tag)", async () => {
      const { encrypt, decrypt } = await import("../crypto");

      const ciphertext = encrypt("api-key-value");
      const buf = Buffer.from(ciphertext, "base64");

      // Flip a byte in the encrypted payload area (after IV + auth tag = 32 bytes)
      if (buf.length > 33) {
        buf[33] ^= 0xff;
      }

      const tampered = buf.toString("base64");
      expect(() => decrypt(tampered)).toThrow();
    });

    it("encrypted API key stored in DB is not the plaintext key", async () => {
      const { createInstance } = await import("../services/instance-service");
      const plaintextKey = "radarr-api-key-abc123";

      await createInstance({
        name: "Encrypted Test",
        type: "radarr",
        baseUrl: "http://localhost:7878",
        apiKey: plaintextKey,
      });

      const raw = sqlite
        .prepare("SELECT api_key FROM instances WHERE name = ?")
        .get("Encrypted Test") as { api_key: string } | undefined;

      expect(raw).toBeDefined();
      expect(raw!.api_key).not.toBe(plaintextKey);
      expect(raw!.api_key).not.toContain(plaintextKey);
    });
  });

  // -----------------------------------------------------------------------
  // 2. API Key Never Returned in Responses
  // -----------------------------------------------------------------------
  describe("API key never returned in responses", () => {
    it("listInstances() result has no apiKey property", async () => {
      const { createInstance, listInstances } = await import(
        "../services/instance-service"
      );

      await createInstance({
        name: "No Leak",
        type: "radarr",
        baseUrl: "http://localhost:7878",
        apiKey: "secret-key-123",
      });

      const all = listInstances();
      expect(all).toHaveLength(1);
      expect(all[0]).not.toHaveProperty("apiKey");
    });

    it("createInstance() result has no apiKey property", async () => {
      const { createInstance } = await import("../services/instance-service");

      const result = await createInstance({
        name: "Create Test",
        type: "sonarr",
        baseUrl: "http://localhost:8989",
        apiKey: "secret-key-456",
      });

      expect(result).not.toHaveProperty("apiKey");
    });

    it("updateInstance() result has no apiKey property", async () => {
      const { createInstance, updateInstance } = await import(
        "../services/instance-service"
      );

      const created = await createInstance({
        name: "Update Test",
        type: "radarr",
        baseUrl: "http://localhost:7878",
        apiKey: "secret-key-789",
      });

      const updated = await updateInstance(created.id, { name: "Renamed" });

      expect(updated).toBeDefined();
      expect(updated).not.toHaveProperty("apiKey");
    });
  });

  // -----------------------------------------------------------------------
  // 3. Authentication Bypass
  // -----------------------------------------------------------------------
  describe("authentication bypass", () => {
    it("rejects empty string credentials", async () => {
      const { setupInitialAdmin, authenticateAdmin } = await import(
        "../services/auth-service"
      );

      await setupInitialAdmin({
        username: "admin",
        password: "secure-pass-123",
        ipAddress: "127.0.0.1",
      });

      const emptyUsername = authenticateAdmin({
        username: "",
        password: "secure-pass-123",
        ipAddress: "10.0.0.1",
      });
      expect(emptyUsername.ok).toBe(false);

      const emptyPassword = authenticateAdmin({
        username: "admin",
        password: "",
        ipAddress: "10.0.0.2",
      });
      expect(emptyPassword.ok).toBe(false);

      const bothEmpty = authenticateAdmin({
        username: "",
        password: "",
        ipAddress: "10.0.0.3",
      });
      expect(bothEmpty.ok).toBe(false);
    });

    it("very long credentials do not crash or bypass", async () => {
      const { setupInitialAdmin, authenticateAdmin } = await import(
        "../services/auth-service"
      );

      await setupInitialAdmin({
        username: "admin",
        password: "secure-pass-123",
        ipAddress: "127.0.0.1",
      });

      const longString = "a".repeat(100_000);

      expect(() =>
        authenticateAdmin({
          username: longString,
          password: longString,
          ipAddress: "10.0.0.1",
        }),
      ).not.toThrow();

      const result = authenticateAdmin({
        username: longString,
        password: longString,
        ipAddress: "10.0.0.2",
      });
      expect(result.ok).toBe(false);
    });

    it("wrong username with correct password is rejected", async () => {
      const { setupInitialAdmin, authenticateAdmin } = await import(
        "../services/auth-service"
      );

      await setupInitialAdmin({
        username: "admin",
        password: "correct-password",
        ipAddress: "127.0.0.1",
      });

      const result = authenticateAdmin({
        username: "not-admin",
        password: "correct-password",
        ipAddress: "10.0.0.1",
      });

      expect(result.ok).toBe(false);
    });

    it("rate limiting tracks each IP independently", async () => {
      const { setupInitialAdmin, authenticateAdmin } = await import(
        "../services/auth-service"
      );

      await setupInitialAdmin({
        username: "admin",
        password: "secure-pass-123",
        ipAddress: "127.0.0.1",
      });

      // Exhaust IP-A's attempts
      for (let i = 0; i < 5; i++) {
        authenticateAdmin({
          username: "admin",
          password: "wrong",
          ipAddress: "192.168.1.100",
        });
      }

      const blockedResult = authenticateAdmin({
        username: "admin",
        password: "secure-pass-123",
        ipAddress: "192.168.1.100",
      });
      expect(blockedResult.ok).toBe(false);
      if (!blockedResult.ok) {
        expect(blockedResult.reason).toBe("rate_limited");
      }

      // IP-B should still work
      const unblockedResult = authenticateAdmin({
        username: "admin",
        password: "secure-pass-123",
        ipAddress: "192.168.1.200",
      });
      expect(unblockedResult.ok).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // 4. Password Hashing Security
  // -----------------------------------------------------------------------
  describe("password hashing security", () => {
    it("same password hashed twice produces different hashes (unique salts)", async () => {
      const { hashPassword } = await import("../auth/password");

      const h1 = hashPassword("my-password");
      const h2 = hashPassword("my-password");

      expect(h1).not.toBe(h2);
    });

    it("hash output has correct format (scrypt:salt:hash)", async () => {
      const { hashPassword } = await import("../auth/password");

      const hash = hashPassword("test-password");
      const parts = hash.split(":");

      expect(parts).toHaveLength(3);
      expect(parts[0]).toBe("scrypt");
      // Salt should be 16 bytes = 32 hex chars
      expect(parts[1]).toMatch(/^[0-9a-f]{32}$/);
      // Hash should be 64 bytes = 128 hex chars
      expect(parts[2]).toMatch(/^[0-9a-f]{128}$/);
    });

    it("empty password can be hashed and verified (no special-case bypass)", async () => {
      const { hashPassword, verifyPassword } = await import(
        "../auth/password"
      );

      const hash = hashPassword("");

      expect(verifyPassword("", hash)).toBe(true);
      expect(verifyPassword("non-empty", hash)).toBe(false);
    });

    it("password with unicode/emoji characters round-trips correctly", async () => {
      const { hashPassword, verifyPassword } = await import(
        "../auth/password"
      );

      const unicodePassword = "p@$$w0rd-\u00fc\u00f1\u00eec\u00f6d\u00e9-\ud83d\udd12\ud83d\ude80";
      const hash = hashPassword(unicodePassword);

      expect(verifyPassword(unicodePassword, hash)).toBe(true);
      expect(verifyPassword("p@$$w0rd", hash)).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // 5. Session Security
  // -----------------------------------------------------------------------
  describe("session security", () => {
    it("generated session tokens have sufficient entropy (>= 32 bytes)", async () => {
      const { createSessionToken } = await import("../auth/session");

      const token = createSessionToken();
      // base64url encoding of 32 bytes = 43 characters
      const decoded = Buffer.from(token, "base64url");

      expect(decoded.length).toBeGreaterThanOrEqual(32);
    });

    it("token hash differs from raw token (HMAC applied)", async () => {
      const { createSessionToken, hashSessionToken } = await import(
        "../auth/session"
      );

      const token = createSessionToken();
      const hash = hashSessionToken(token);

      expect(hash).not.toBe(token);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    it("expired session returns null from getAuthenticatedSession()", async () => {
      const { setupInitialAdmin, authenticateAdmin, getAuthenticatedSession } =
        await import("../services/auth-service");

      await setupInitialAdmin({
        username: "admin",
        password: "secure-pass-123",
        ipAddress: "127.0.0.1",
      });

      const login = authenticateAdmin({
        username: "admin",
        password: "secure-pass-123",
        ipAddress: "127.0.0.1",
      });

      if (!login.ok) throw new Error("Expected login to succeed");

      // Manually expire the session in the database
      sqlite.exec(`UPDATE auth_sessions SET expires_at = '2020-01-01T00:00:00.000Z'`);

      const session = getAuthenticatedSession(login.sessionToken);
      expect(session).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // 6. Error Message Information Leakage
  // -----------------------------------------------------------------------
  describe("error message information leakage", () => {
    it("error() helper with a stack trace string still produces safe JSON", async () => {
      const { error } = await import("../utils/api-response");

      const fakeStack =
        "Error: DB failure\n    at Object.<anonymous> (/Users/dev/Projects/ArrMate/src/lib/db/index.ts:42:11)";
      const response = error(fakeStack, 500);
      const body = await response.json();

      // The helper puts whatever message we give it into the response — the
      // caller is responsible for not forwarding raw stacks. But the response
      // shape should still be valid JSON with no extra fields.
      expect(body).toHaveProperty("error");
      expect(Object.keys(body)).toEqual(["error"]);
    });

    it("failed auth returns a generic message, not a username/password hint", async () => {
      const { setupInitialAdmin, authenticateAdmin } = await import(
        "../services/auth-service"
      );

      await setupInitialAdmin({
        username: "admin",
        password: "secure-pass-123",
        ipAddress: "127.0.0.1",
      });

      const wrongUser = authenticateAdmin({
        username: "nonexistent",
        password: "secure-pass-123",
        ipAddress: "10.0.0.1",
      });

      const wrongPass = authenticateAdmin({
        username: "admin",
        password: "wrong-password",
        ipAddress: "10.0.0.2",
      });

      if (wrongUser.ok || wrongPass.ok) {
        throw new Error("Expected both to fail");
      }

      // Both should return the same generic message — no hint about which
      // part of the credential was wrong.
      expect(wrongUser.message).toBe(wrongPass.message);
      expect(wrongUser.message).not.toMatch(/username/i);
      expect(wrongUser.message).not.toMatch(/not found/i);
      expect(wrongUser.message).not.toMatch(/password/i);
      expect(wrongUser.reason).toBe(wrongPass.reason);
    });

    it("api-response sets security headers on all responses", async () => {
      const { success, error } = await import("../utils/api-response");

      const okResponse = success({ data: "test" });
      const errResponse = error("Something went wrong", 500);

      for (const response of [okResponse, errResponse]) {
        expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
        expect(response.headers.get("X-Frame-Options")).toBe("DENY");
        expect(response.headers.get("Cache-Control")).toBe("no-store");
        expect(response.headers.get("Referrer-Policy")).toBe("same-origin");
      }
    });
  });
});
