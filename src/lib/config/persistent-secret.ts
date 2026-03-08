import { randomBytes } from "crypto";
import fs from "fs";
import path from "path";
import { getDatabasePath } from "../db";

export function getPersistentSecretPath(filename: string) {
  return path.join(path.dirname(getDatabasePath()), filename);
}

export function readPersistentHexSecret(filename: string): string | null {
  const secretPath = getPersistentSecretPath(filename);

  try {
    const existing = fs.readFileSync(secretPath, "utf8").trim();
    return existing || null;
  } catch (err) {
    if (!(err instanceof Error) || !("code" in err) || err.code !== "ENOENT") {
      throw err;
    }

    return null;
  }
}

export function writePersistentHexSecret(filename: string, value = randomBytes(32).toString("hex")): string {
  const secretPath = getPersistentSecretPath(filename);
  fs.mkdirSync(path.dirname(secretPath), { recursive: true });
  fs.writeFileSync(secretPath, `${value}\n`, { encoding: "utf8", mode: 0o600 });
  return value;
}

export function getOrCreatePersistentHexSecret(filename: string): string {
  return readPersistentHexSecret(filename) ?? writePersistentHexSecret(filename);
}

export function removePersistentHexSecret(filename: string) {
  fs.rmSync(getPersistentSecretPath(filename), { force: true });
}
