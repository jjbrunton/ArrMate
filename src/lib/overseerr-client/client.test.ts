import { beforeEach, describe, expect, it, vi } from "vitest";
import { OverseerrClient } from "./client";
import { OverseerrApiError, OverseerrConnectionError } from "./errors";

describe("OverseerrClient", () => {
  let client: OverseerrClient;

  beforeEach(() => {
    client = new OverseerrClient("http://localhost:5055/", "test-api-key");
    vi.restoreAllMocks();
  });

  function mockFetch(data: unknown, status = 200, ok = true) {
    return vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok,
      status,
      json: () => Promise.resolve(data),
      text: () => Promise.resolve(JSON.stringify(data)),
    } as Response);
  }

  it("normalizes the base url", async () => {
    const fetchSpy = mockFetch({ version: "1.0.0" });

    await client.testConnection();

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:5055/api/v1/status",
      expect.any(Object),
    );
  });

  it("verifies the API connection", async () => {
    const fetchSpy = mockFetch({ version: "1.0.0" });

    await expect(client.testConnection()).resolves.toEqual({
      appName: "Overseerr",
      version: "1.0.0",
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:5055/api/v1/status",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ "X-Api-Key": "test-api-key" }),
      }),
    );
  });

  it("fetches every request page", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          pageInfo: { page: 1, pageSize: 2, pages: 2, results: 3 },
          results: [{ id: 1 }, { id: 2 }],
        }),
        text: () => Promise.resolve(""),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          pageInfo: { page: 2, pageSize: 2, pages: 2, results: 3 },
          results: [{ id: 3 }],
        }),
        text: () => Promise.resolve(""),
      } as Response);

    const requests = await client.getAllRequests(2);

    expect(requests).toHaveLength(3);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("fetches movie titles", async () => {
    const fetchSpy = mockFetch({ id: 99, title: "The Matrix" });

    await expect(client.getMovieDetails(99)).resolves.toEqual({ id: 99, title: "The Matrix" });
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:5055/api/v1/movie/99",
      expect.any(Object),
    );
  });

  it("fetches tv titles", async () => {
    const fetchSpy = mockFetch({ id: 88, name: "Severance" });

    await expect(client.getTvDetails(88)).resolves.toEqual({ id: 88, name: "Severance" });
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:5055/api/v1/tv/88",
      expect.any(Object),
    );
  });

  it("throws an API error on non-ok responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Unauthorized"),
      json: () => Promise.resolve({}),
    } as Response);

    await expect(client.testConnection()).rejects.toThrow(OverseerrApiError);
  });

  it("throws a connection error on network failures", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(client.testConnection()).rejects.toThrow(OverseerrConnectionError);
  });
});
