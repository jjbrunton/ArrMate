import { describe, expect, it } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie, getSessionCookieName, getSessionTokenFromRequest, hashSessionToken, setSessionCookie } from "./session";

describe("auth session", () => {
  it("hashes tokens deterministically", () => {
    process.env.AUTH_SESSION_SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    expect(hashSessionToken("token")).toBe(hashSessionToken("token"));
    expect(hashSessionToken("token")).not.toBe(hashSessionToken("other"));
  });

  it("writes and clears session cookies", () => {
    const response = NextResponse.json({ ok: true });
    const expiry = new Date("2026-03-09T12:00:00.000Z");

    setSessionCookie(response, "session-token", expiry);
    expect(response.cookies.get(getSessionCookieName())?.value).toBe("session-token");

    clearSessionCookie(response);
    expect(response.cookies.get(getSessionCookieName())?.value).toBe("");
  });

  it("reads session tokens from requests", () => {
    const request = new NextRequest("http://localhost:3000/api/issues", {
      headers: {
        cookie: `${getSessionCookieName()}=session-token`,
      },
    });

    expect(getSessionTokenFromRequest(request)).toBe("session-token");
  });
});
