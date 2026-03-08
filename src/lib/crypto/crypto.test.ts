import { randomBytes } from "crypto";
import Database from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = {
  DB_PATH: process.env.DB_PATH,
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
};

const CREATE_INSTANCES_SQL = `
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

  CREATE TABLE IF NOT EXISTS __drizzle_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hash TEXT NOT NULL,
    created_at NUMERIC
  );

  INSERT INTO __drizzle_migrations (hash, created_at)
  SELECT 'crypto-test-bootstrap', 1773002761999
  WHERE NOT EXISTS (SELECT 1 FROM __drizzle_migrations);
`;

let tempDir: string;

function setupDatabase() {
  const sqlite = new Database(process.env.DB_PATH!);
  sqlite.exec(CREATE_INSTANCES_SQL);
  sqlite.close();
}

function insertInstance(apiKey: string) {
  const sqlite = new Database(process.env.DB_PATH!);
  const result = sqlite.prepare(`
    INSERT INTO instances (name, type, base_url, api_key)
    VALUES (?, ?, ?, ?)
  `).run("Test Instance", "radarr", "http://localhost:7878", apiKey);
  sqlite.close();
  return Number(result.lastInsertRowid);
}

function readInstanceApiKey(id: number) {
  const sqlite = new Database(process.env.DB_PATH!);
  const row = sqlite.prepare("SELECT api_key FROM instances WHERE id = ?").get(id) as { api_key: string } | undefined;
  sqlite.close();
  return row?.api_key ?? null;
}

async function importFreshCrypto() {
  vi.resetModules();
  return import("./index");
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arrmate-crypto-"));
  process.env.DB_PATH = path.join(tempDir, "arrmate.db");
});

afterEach(() => {
  vi.resetModules();

  if (ORIGINAL_ENV.DB_PATH === undefined) {
    delete process.env.DB_PATH;
  } else {
    process.env.DB_PATH = ORIGINAL_ENV.DB_PATH;
  }

  if (ORIGINAL_ENV.ENCRYPTION_KEY === undefined) {
    delete process.env.ENCRYPTION_KEY;
  } else {
    process.env.ENCRYPTION_KEY = ORIGINAL_ENV.ENCRYPTION_KEY;
  }

  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("crypto", () => {
  it("generates and persists an encryption key when the env var is missing", async () => {
    delete process.env.ENCRYPTION_KEY;
    setupDatabase();

    const { bootstrapEncryptionKey, decrypt, encrypt } = await importFreshCrypto();

    bootstrapEncryptionKey();

    const persistedPath = path.join(tempDir, "encryption-key.hex");
    const persistedKey = fs.readFileSync(persistedPath, "utf8").trim();

    expect(persistedKey).toHaveLength(64);

    const ciphertext = encrypt("arr-api-key");
    expect(ciphertext).not.toBe("arr-api-key");
    expect(decrypt(ciphertext)).toBe("arr-api-key");
  });

  it("re-encrypts existing instance API keys onto the new persisted key", async () => {
    const originalKey = randomBytes(32).toString("hex");
    process.env.ENCRYPTION_KEY = originalKey;
    setupDatabase();

    const { bootstrapEncryptionKey, encrypt } = await importFreshCrypto();
    const originalCiphertext = encrypt("arr-api-key");
    const instanceId = insertInstance(originalCiphertext);

    bootstrapEncryptionKey();

    const persistedPath = path.join(tempDir, "encryption-key.hex");
    const legacyPath = path.join(tempDir, "encryption-key-legacy.hex");
    const persistedKey = fs.readFileSync(persistedPath, "utf8").trim();
    const migratedCiphertext = readInstanceApiKey(instanceId);

    expect(persistedKey).toHaveLength(64);
    expect(persistedKey).not.toBe(originalKey);
    expect(fs.existsSync(legacyPath)).toBe(false);
    expect(migratedCiphertext).not.toBeNull();
    expect(migratedCiphertext).not.toBe(originalCiphertext);

    delete process.env.ENCRYPTION_KEY;

    const freshCrypto = await importFreshCrypto();
    expect(freshCrypto.decrypt(migratedCiphertext!)).toBe("arr-api-key");
  });

  it("throws when an existing database cannot be migrated without an old key", async () => {
    delete process.env.ENCRYPTION_KEY;
    setupDatabase();
    insertInstance("existing-ciphertext");

    const { bootstrapEncryptionKey } = await importFreshCrypto();

    expect(() => bootstrapEncryptionKey()).toThrow(
      "No persisted encryption key exists and ENCRYPTION_KEY is unavailable. Existing instance API keys cannot be migrated.",
    );
  });

  it("rejects invalid encryption keys", async () => {
    process.env.ENCRYPTION_KEY = "too-short";
    setupDatabase();

    const { bootstrapEncryptionKey } = await importFreshCrypto();

    expect(() => bootstrapEncryptionKey()).toThrow("ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
  });
});
