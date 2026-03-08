import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getAuthEnvironmentStatus, getAuthSessionSecret } from "./config";

const ORIGINAL_ENV = {
  AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET,
  DB_PATH: process.env.DB_PATH,
};

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "arrmate-auth-config-"));
  process.env.DB_PATH = path.join(tempDir, "arrmate.db");
});

afterEach(() => {
  if (ORIGINAL_ENV.AUTH_SESSION_SECRET === undefined) {
    delete process.env.AUTH_SESSION_SECRET;
  } else {
    process.env.AUTH_SESSION_SECRET = ORIGINAL_ENV.AUTH_SESSION_SECRET;
  }

  if (ORIGINAL_ENV.DB_PATH === undefined) {
    delete process.env.DB_PATH;
  } else {
    process.env.DB_PATH = ORIGINAL_ENV.DB_PATH;
  }

  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("auth config", () => {
  it("generates and persists a session secret when the env var is missing", () => {
    delete process.env.AUTH_SESSION_SECRET;

    expect(getAuthEnvironmentStatus()).toEqual({ ready: true });
    expect(getAuthSessionSecret()).toHaveLength(32);

    const secretPath = path.join(tempDir, "auth-session-secret.hex");
    const persisted = fs.readFileSync(secretPath, "utf8").trim();

    expect(persisted).toHaveLength(64);
    expect(getAuthSessionSecret().toString("hex")).toBe(persisted);
  });

  it("uses the configured session secret when provided", () => {
    process.env.AUTH_SESSION_SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    expect(getAuthEnvironmentStatus()).toEqual({ ready: true });
    expect(getAuthSessionSecret().toString("hex")).toBe(process.env.AUTH_SESSION_SECRET);
  });
});
