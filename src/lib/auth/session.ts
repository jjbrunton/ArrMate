import { createHmac, randomBytes } from "crypto";
import type { NextRequest, NextResponse } from "next/server";
import { getAuthSessionSecret } from "./config";

const DEV_COOKIE_NAME = "arrmate_session";
const PROD_COOKIE_NAME = "__Host-arrmate_session";

export function getSessionCookieName() {
  return process.env.NODE_ENV === "production" ? PROD_COOKIE_NAME : DEV_COOKIE_NAME;
}

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string) {
  return createHmac("sha256", getAuthSessionSecret()).update(token).digest("hex");
}

export function setSessionCookie(response: NextResponse, token: string, expiresAt: Date) {
  response.cookies.set({
    name: getSessionCookieName(),
    value: token,
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
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
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });
}

export function getSessionTokenFromRequest(request: NextRequest) {
  return request.cookies.get(getSessionCookieName())?.value;
}
