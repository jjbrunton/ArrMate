import { describe, it, expect, vi, beforeEach } from "vitest";
import { ArrClient } from "./client";
import { ArrApiError, ArrConnectionError } from "./errors";

describe("ArrClient", () => {
  let client: ArrClient;

  beforeEach(() => {
    client = new ArrClient("http://localhost:7878", "test-api-key", "radarr");
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

  describe("constructor", () => {
    it("removes trailing slashes from baseUrl", () => {
      const c = new ArrClient("http://localhost:7878///", "key");
      // Verify by calling testConnection and checking the URL
      const fetchSpy = mockFetch({ appName: "Radarr" });
      c.testConnection();
      expect(fetchSpy).toHaveBeenCalledWith(
        "http://localhost:7878/api/v3/system/status",
        expect.any(Object),
      );
    });
  });

  describe("testConnection", () => {
    it("calls GET /system/status with API key header", async () => {
      const fetchSpy = mockFetch({ appName: "Radarr", version: "5.0", urlBase: "" });
      const result = await client.testConnection();
      expect(result).toEqual({ appName: "Radarr", version: "5.0", urlBase: "" });
      expect(fetchSpy).toHaveBeenCalledWith(
        "http://localhost:7878/api/v3/system/status",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({ "X-Api-Key": "test-api-key" }),
        }),
      );
    });
  });

  describe("getQueue", () => {
    it("includes radarr-specific params", async () => {
      const fetchSpy = mockFetch({ page: 1, pageSize: 50, totalRecords: 0, records: [] });
      await client.getQueue();
      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain("includeUnknownMovieItems=true");
      expect(url).toContain("includeMovie=true");
    });

    it("includes sonarr-specific params", async () => {
      const sonarrClient = new ArrClient("http://localhost:8989", "key", "sonarr");
      const fetchSpy = mockFetch({ page: 1, pageSize: 50, totalRecords: 0, records: [] });
      await sonarrClient.getQueue();
      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain("includeUnknownSeriesItems=true");
      expect(url).toContain("includeSeries=true");
      expect(url).toContain("includeEpisode=true");
    });
  });

  describe("getAllQueueItems", () => {
    it("fetches all pages", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce({
          ok: true, status: 200,
          json: () => Promise.resolve({ page: 1, pageSize: 100, totalRecords: 3, records: [{ id: 1 }, { id: 2 }] }),
          text: () => Promise.resolve(""),
        } as Response)
        .mockResolvedValueOnce({
          ok: true, status: 200,
          json: () => Promise.resolve({ page: 2, pageSize: 100, totalRecords: 3, records: [{ id: 3 }] }),
          text: () => Promise.resolve(""),
        } as Response);

      const items = await client.getAllQueueItems();
      expect(items).toHaveLength(3);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe("removeQueueItem", () => {
    it("sends DELETE with options", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true, status: 204,
        json: () => Promise.resolve(undefined),
        text: () => Promise.resolve(""),
      } as Response);
      await client.removeQueueItem(42, { removeFromClient: true, blocklist: true });
      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain("/queue/42");
      expect(url).toContain("removeFromClient=true");
      expect(url).toContain("blocklist=true");
    });
  });

  describe("error handling", () => {
    it("throws ArrApiError on non-ok response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: false, status: 401,
        text: () => Promise.resolve("Unauthorized"),
        json: () => Promise.resolve({}),
      } as Response);
      await expect(client.testConnection()).rejects.toThrow(ArrApiError);
    });

    it("throws ArrConnectionError on network failure", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
      await expect(client.testConnection()).rejects.toThrow(ArrConnectionError);
    });
  });

  describe("searchForUpgrade", () => {
    it("uses MoviesSearch for radarr", async () => {
      const fetchSpy = mockFetch({ id: 1, name: "MoviesSearch", commandName: "MoviesSearch", status: "queued" });
      await client.searchForUpgrade([1, 2]);
      const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
      expect(body.name).toBe("MoviesSearch");
      expect(body.movieIds).toEqual([1, 2]);
    });

    it("uses EpisodeSearch for sonarr", async () => {
      const sonarrClient = new ArrClient("http://localhost:8989", "key", "sonarr");
      const fetchSpy = mockFetch({ id: 1, name: "EpisodeSearch", commandName: "EpisodeSearch", status: "queued" });
      await sonarrClient.searchForUpgrade([1, 2]);
      const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
      expect(body.name).toBe("EpisodeSearch");
      expect(body.episodeIds).toEqual([1, 2]);
    });
  });

  describe("getAllCutoffUnmetItems", () => {
    it("fetches all cutoff pages", async () => {
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce({
          ok: true, status: 200,
          json: () => Promise.resolve({ page: 1, pageSize: 1000, totalRecords: 3, records: [{ id: 1 }, { id: 2 }] }),
          text: () => Promise.resolve(""),
        } as Response)
        .mockResolvedValueOnce({
          ok: true, status: 200,
          json: () => Promise.resolve({ page: 2, pageSize: 1000, totalRecords: 3, records: [{ id: 3 }] }),
          text: () => Promise.resolve(""),
        } as Response);

      const items = await client.getAllCutoffUnmetItems();
      expect(items).toHaveLength(3);
    });
  });

  describe("getQualityProfiles", () => {
    it("calls GET /qualityprofile", async () => {
      const fetchSpy = mockFetch([{ id: 1, name: "HD", cutoff: 4, upgradeAllowed: true, items: [] }]);
      const profiles = await client.getQualityProfiles();
      expect(profiles).toHaveLength(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        "http://localhost:7878/api/v3/qualityprofile",
        expect.objectContaining({
          method: "GET",
        }),
      );
    });
  });
});
