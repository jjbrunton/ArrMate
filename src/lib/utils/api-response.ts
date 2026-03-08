import { NextResponse } from "next/server";

const DEFAULT_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "same-origin",
};

export function success<T>(data: T, status = 200, headers?: HeadersInit) {
  return NextResponse.json({ data }, { status, headers: { ...DEFAULT_HEADERS, ...headers } });
}

export function error(message: string, status = 500, headers?: HeadersInit) {
  return NextResponse.json({ error: message }, { status, headers: { ...DEFAULT_HEADERS, ...headers } });
}
