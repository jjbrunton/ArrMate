import { createHmac, randomBytes } from "crypto";
import type { NextRequest, NextResponse } from "next/server";
import { getAuthSessionSecret } from "./config";

const COOKIE_NAME = "arrmate_session";

export function getSessionCookieName() {
  return COOKIE_NAME;
}

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string) {
  return createHmac("sha256", getAuthSessionSecret()).update(token).digest("hex");
}

function useSecureCookies() {
  return process.env.SECURE_COOKIES === "true";
}

export function setSessionCookie(response: NextResponse, token: string, expiresAt: Date) {
  response.cookies.set({
    name: getSessionCookieName(),
    value: token,
    httpOnly: true,
    sameSite: "strict",
    secure: useSecureCookies(),
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: getSessionCookieName(),
    value: "",
    httpOnly: true,
    sameSite: "strict",
    secure: useSecureCookies(),
    path: "/",
    expires: new Date(0),
  });
}

export function getSessionTokenFromRequest(request: NextRequest) {
  return request.cookies.get(getSessionCookieName())?.value;
}
