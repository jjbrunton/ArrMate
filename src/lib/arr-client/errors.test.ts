import { describe, it, expect } from "vitest";
import { ArrApiError, ArrConnectionError } from "./errors";

describe("ArrApiError", () => {
  it("has correct properties", () => {
    const err = new ArrApiError(404, "Not found", "http://localhost/api/v3/test");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ArrApiError");
    expect(err.statusCode).toBe(404);
    expect(err.url).toBe("http://localhost/api/v3/test");
    expect(err.message).toContain("404");
    expect(err.message).toContain("Not found");
    expect(err.message).toContain("http://localhost/api/v3/test");
  });
});

describe("ArrConnectionError", () => {
  it("has correct properties", () => {
    const cause = new Error("ECONNREFUSED");
    const err = new ArrConnectionError("Connection refused", "http://localhost/api/v3/test", cause);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ArrConnectionError");
    expect(err.url).toBe("http://localhost/api/v3/test");
    expect(err.cause).toBe(cause);
    expect(err.message).toContain("Connection refused");
  });

  it("works without cause", () => {
    const err = new ArrConnectionError("Timeout", "http://localhost/api/v3/test");
    expect(err.cause).toBeUndefined();
  });
});
