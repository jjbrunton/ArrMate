import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { ensureSameOrigin, getClientIpAddress } from "./request";

describe("auth request helpers", () => {
  it("extracts the first forwarded IP address", () => {
    const request = new NextRequest("http://localhost:3000/api/issues", {
      headers: {
        "x-forwarded-for": "203.0.113.1, 203.0.113.2",
      },
    });

    expect(getClientIpAddress(request)).toBe("203.0.113.1");
  });

  it("accepts same-origin requests", () => {
    const request = new NextRequest("http://localhost:3000/api/issues", {
      headers: {
        origin: "http://localhost:3000",
      },
    });

    expect(ensureSameOrigin(request)).toBeNull();
  });

  it("rejects cross-origin requests", () => {
    const request = new NextRequest("http://localhost:3000/api/issues", {
      headers: {
        origin: "https://example.com",
      },
    });

    expect(ensureSameOrigin(request)).toBe("Invalid request origin");
  });
});
