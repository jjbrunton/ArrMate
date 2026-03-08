import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { instances } from "../db/schema";
import {
  getOrCreatePersistentHexSecret,
  readPersistentHexSecret,
  removePersistentHexSecret,
  writePersistentHexSecret,
} from "../config/persistent-secret";
import { createLogger } from "../utils/logger";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const PERSISTED_ENCRYPTION_KEY_FILE = "encryption-key.hex";
const LEGACY_ENCRYPTION_KEY_FILE = "encryption-key-legacy.hex";

const log = createLogger("crypto");

function parseKey(key: string, source: string): Buffer {
  const buf = Buffer.from(key, "hex");
  if (buf.length !== 32) throw new Error(`${source} must be 64 hex characters (32 bytes)`);
  return buf;
}

function getEnvironmentKey(): string | null {
  return process.env.ENCRYPTION_KEY?.trim() || null;
}

function getPrimaryKeyHex(): string {
  return readPersistentHexSecret(PERSISTED_ENCRYPTION_KEY_FILE)
    ?? getEnvironmentKey()
    ?? getOrCreatePersistentHexSecret(PERSISTED_ENCRYPTION_KEY_FILE);
}

function getFallbackKeyHexes(primaryKeyHex: string): string[] {
  return [
    readPersistentHexSecret(LEGACY_ENCRYPTION_KEY_FILE),
    getEnvironmentKey(),
  ].filter((value): value is string => Boolean(value && value !== primaryKeyHex));
}

function encryptWithKey(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

function decryptWithKey(ciphertext: string, key: Buffer): string {
  const buf = Buffer.from(ciphertext, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final("utf8");
}

export function encrypt(plaintext: string): string {
  return encryptWithKey(plaintext, parseKey(getPrimaryKeyHex(), "ENCRYPTION_KEY"));
}

export function decrypt(ciphertext: string): string {
  const primaryKeyHex = getPrimaryKeyHex();

  try {
    return decryptWithKey(ciphertext, parseKey(primaryKeyHex, "ENCRYPTION_KEY"));
  } catch (primaryError) {
    for (const fallbackKeyHex of getFallbackKeyHexes(primaryKeyHex)) {
      try {
        return decryptWithKey(ciphertext, parseKey(fallbackKeyHex, "ENCRYPTION_KEY"));
      } catch {
        // Continue to the next fallback key.
      }
    }

    throw primaryError;
  }
}

function migrateEncryptionKey(oldKeyHex: string, newKeyHex: string) {
  const db = getDb();
  const rows = db.select({
    id: instances.id,
    apiKey: instances.apiKey,
  }).from(instances).all();

  let migrated = 0;

  for (const row of rows) {
    let plaintext: string;

    try {
      plaintext = decryptWithKey(row.apiKey, parseKey(oldKeyHex, "ENCRYPTION_KEY"));
    } catch {
      try {
        decryptWithKey(row.apiKey, parseKey(newKeyHex, "persisted ENCRYPTION_KEY"));
        continue;
      } catch {
        throw new Error(`Failed to decrypt instance ${row.id} during encryption-key migration`);
      }
    }

    db.update(instances)
      .set({
        apiKey: encryptWithKey(plaintext, parseKey(newKeyHex, "persisted ENCRYPTION_KEY")),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(instances.id, row.id))
      .run();
    migrated += 1;
  }

  return migrated;
}

export function bootstrapEncryptionKey() {
  const persistedKey = readPersistentHexSecret(PERSISTED_ENCRYPTION_KEY_FILE);
  const legacyKey = readPersistentHexSecret(LEGACY_ENCRYPTION_KEY_FILE);

  if (persistedKey && legacyKey) {
    const migrated = migrateEncryptionKey(legacyKey, persistedKey);
    removePersistentHexSecret(LEGACY_ENCRYPTION_KEY_FILE);
    log.info({ migrated }, "Completed interrupted encryption-key migration");
    return;
  }

  if (persistedKey) {
    parseKey(persistedKey, "persisted ENCRYPTION_KEY");
    return;
  }

  const environmentKey = getEnvironmentKey();

  if (!environmentKey) {
    const existingInstance = getDb().select({ id: instances.id }).from(instances).limit(1).get();

    if (existingInstance) {
      throw new Error(
        "No persisted encryption key exists and ENCRYPTION_KEY is unavailable. Existing instance API keys cannot be migrated.",
      );
    }

    getOrCreatePersistentHexSecret(PERSISTED_ENCRYPTION_KEY_FILE);
    return;
  }

  parseKey(environmentKey, "ENCRYPTION_KEY");

  const nextKey = writePersistentHexSecret(PERSISTED_ENCRYPTION_KEY_FILE);
  const existingInstance = getDb().select({ id: instances.id }).from(instances).limit(1).get();

  if (!existingInstance) {
    return;
  }

  writePersistentHexSecret(LEGACY_ENCRYPTION_KEY_FILE, environmentKey);

  try {
    const migrated = migrateEncryptionKey(environmentKey, nextKey);
    removePersistentHexSecret(LEGACY_ENCRYPTION_KEY_FILE);
    log.info({ migrated }, "Re-encrypted stored instance API keys onto the persisted encryption key");
  } catch (err) {
    log.error({ err }, "Failed to migrate stored instance API keys to the persisted encryption key");
    throw err;
  }
}
