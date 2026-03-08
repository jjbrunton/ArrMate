import { describe, expect, it } from "vitest";
import { hashPassword, isSupportedPasswordHash, verifyPassword } from "./password";

describe("password auth", () => {
  it("hashes and verifies passwords", () => {
    const hash = hashPassword("correct horse battery staple");

    expect(hash).not.toBe("correct horse battery staple");
    expect(verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects incorrect passwords", () => {
    const hash = hashPassword("super-secret");

    expect(verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("rejects unsupported hash formats", () => {
    expect(verifyPassword("password", "plain-text")).toBe(false);
    expect(isSupportedPasswordHash("plain-text")).toBe(false);
  });
});
