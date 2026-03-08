import { describe, expect, it } from "vitest";
import { OverseerrApiError, OverseerrConnectionError } from "./errors";

describe("overseerr-client errors", () => {
  it("captures API error details", () => {
    const error = new OverseerrApiError(403, "Forbidden", "http://localhost/api/v1/status");

    expect(error.name).toBe("OverseerrApiError");
    expect(error.message).toContain("403");
    expect(error.url).toBe("http://localhost/api/v1/status");
  });

  it("captures connection error details", () => {
    const cause = new Error("ECONNREFUSED");
    const error = new OverseerrConnectionError("Failed", "http://localhost/api/v1/status", cause);

    expect(error.name).toBe("OverseerrConnectionError");
    expect(error.message).toContain("Failed");
    expect(error.url).toBe("http://localhost/api/v1/status");
    expect(error.cause).toBe(cause);
  });
});

