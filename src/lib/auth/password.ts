import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const HASH_PREFIX = "scrypt";
const SALT_LENGTH = 16;
const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const derived = scryptSync(password, salt, KEY_LENGTH);

  return [HASH_PREFIX, salt.toString("hex"), derived.toString("hex")].join(":");
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [prefix, saltHex, hashHex] = storedHash.split(":");

  if (prefix !== HASH_PREFIX || !saltHex || !hashHex) {
    return false;
  }

  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");

  if (!salt.length || !expected.length) {
    return false;
  }

  const actual = scryptSync(password, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function isSupportedPasswordHash(value: string): boolean {
  const [prefix, saltHex, hashHex] = value.split(":");
  return prefix === HASH_PREFIX && Boolean(saltHex) && Boolean(hashHex);
}
