import { describe, it, expect } from "vitest";
import { success, error } from "./api-response";

describe("api-response", () => {
  describe("success", () => {
    it("returns JSON response with data", async () => {
      const res = success({ id: 1, name: "test" });
      const body = await res.json();
      expect(body).toEqual({ data: { id: 1, name: "test" } });
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("no-store");
    });

    it("accepts custom status", async () => {
      const res = success({ created: true }, 201);
      expect(res.status).toBe(201);
    });
  });

  describe("error", () => {
    it("returns JSON response with error message", async () => {
      const res = error("Not found", 404);
      const body = await res.json();
      expect(body).toEqual({ error: "Not found" });
      expect(res.status).toBe(404);
      expect(res.headers.get("x-frame-options")).toBe("DENY");
    });

    it("defaults to 500", async () => {
      const res = error("Something broke");
      expect(res.status).toBe(500);
    });
  });
});
