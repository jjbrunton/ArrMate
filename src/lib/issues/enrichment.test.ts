import { describe, it, expect, beforeEach } from "vitest";
import { enrichDetectedIssues } from "./enrichment";
import { createMockArrClient } from "../test-utils/mock-arr-client";
import { makeQueueItem } from "../test-utils/fixtures";
import type { ArrClient } from "../arr-client/client";
import type { DetectionResult } from "./detector";
import type { DetectedIssueInput } from "./types";

function makeDetectionResult(
  overrides: { queueItem?: Partial<ReturnType<typeof makeQueueItem>>; issue?: Partial<DetectedIssueInput> } = {},
): DetectionResult {
  return {
    queueItem: makeQueueItem(overrides.queueItem),
    issue: {
      type: "duplicate",
      severity: "warning",
      title: "Test issue",
      description: "Test description",
      suggestedFixes: [],
      ...overrides.issue,
    },
  };
}

describe("enrichDetectedIssues", () => {
  let client: ReturnType<typeof createMockArrClient>;
  let arrClient: ArrClient;

  beforeEach(() => {
    client = createMockArrClient();
    arrClient = client as unknown as ArrClient;
  });

  it("does nothing with empty results", async () => {
    await enrichDetectedIssues(arrClient, "radarr", []);
    expect(client.getHistoryByDownloadId).not.toHaveBeenCalled();
  });

  it("enriches duplicate issues with grab history", async () => {
    const result = makeDetectionResult({
      queueItem: { downloadId: "dl-123" },
      issue: { type: "duplicate", description: "Duplicate detected" },
    });

    client.getHistoryByDownloadId.mockResolvedValue({
      page: 1, pageSize: 10, totalRecords: 1,
      records: [{
        id: 1, eventType: "grabbed", sourceTitle: "test", date: "2024-01-01",
        data: {},
        movie: { id: 1, title: "Test Movie", year: 2024, tmdbId: 12345 },
      }],
    });

    await enrichDetectedIssues(arrClient, "radarr", [result]);
    expect(result.issue.description).toContain("Originally grabbed for: Test Movie (2024)");
  });

  it("enriches sonarr issues with series/episode info", async () => {
    const result = makeDetectionResult({
      queueItem: { downloadId: "dl-456" },
      issue: { type: "duplicate", description: "Duplicate" },
    });

    client.getHistoryByDownloadId.mockResolvedValue({
      page: 1, pageSize: 10, totalRecords: 1,
      records: [{
        id: 1, eventType: "grabbed", sourceTitle: "test", date: "2024-01-01",
        data: {},
        series: { id: 1, title: "Test Show" },
        episode: { id: 1, title: "Pilot", seasonNumber: 1, episodeNumber: 3 },
      }],
    });

    await enrichDetectedIssues(arrClient, "sonarr", [result]);
    expect(result.issue.description).toContain("Originally grabbed for: Test Show S01E03");
  });

  it("skips enrichment for issues without downloadId", async () => {
    const result = makeDetectionResult({
      queueItem: { downloadId: null },
      issue: { type: "duplicate", description: "Original" },
    });

    await enrichDetectedIssues(arrClient, "radarr", [result]);
    expect(result.issue.description).toBe("Original");
  });

  it("skips enrichment for non-enrichable types", async () => {
    const result = makeDetectionResult({
      queueItem: { downloadId: "dl-789" },
      issue: { type: "stalled", description: "Stalled" },
    });

    await enrichDetectedIssues(arrClient, "radarr", [result]);
    expect(client.getHistoryByDownloadId).not.toHaveBeenCalled();
  });

  it("handles grab history fetch failure gracefully", async () => {
    const result = makeDetectionResult({
      queueItem: { downloadId: "dl-err" },
      issue: { type: "duplicate", description: "Original" },
    });

    client.getHistoryByDownloadId.mockRejectedValue(new Error("Network error"));

    await enrichDetectedIssues(arrClient, "radarr", [result]);
    expect(result.issue.description).toBe("Original");
  });

  describe("enrichMultipleMovieIssues", () => {
    function makeImportBlockedResult(candidates: Array<{ tmdbId: number; title: string; year: number }>) {
      return makeDetectionResult({
        queueItem: { downloadId: "dl-multi" },
        issue: {
          type: "import_blocked",
          description: "Found multiple movies",
          suggestedFixes: candidates.map((c, i) => ({
            action: "select_movie_import" as const,
            label: `Import as "${c.title} (${c.year})"`,
            description: `Import as ${c.title}`,
            priority: i + 1,
            automatable: true,
            params: { tmdbId: c.tmdbId, title: c.title, year: c.year },
          })),
        },
      });
    }

    it("resolves single library match", async () => {
      const result = makeImportBlockedResult([
        { tmdbId: 100, title: "Movie A", year: 2020 },
        { tmdbId: 200, title: "Movie B", year: 2021 },
      ]);

      client.getMovies.mockResolvedValue([
        { id: 10, title: "Movie A", year: 2020, tmdbId: 100, hasFile: false, monitored: true },
      ]);

      // Mock history to return empty (no grabs) so it doesn't interfere
      client.getHistoryByDownloadId.mockResolvedValue({
        page: 1, pageSize: 10, totalRecords: 0, records: [],
      });

      await enrichDetectedIssues(arrClient, "radarr", [result]);

      const selectFixes = result.issue.suggestedFixes.filter((f) => f.action === "select_movie_import");
      // Movie A should be promoted (only one in library)
      const movieAFix = selectFixes.find((f) => f.params?.tmdbId === 100);
      expect(movieAFix?.priority).toBe(0);
      expect(movieAFix?.params?.movieId).toBe(10);
    });

    it("disambiguates via movie history when multiple in library", async () => {
      const result = makeImportBlockedResult([
        { tmdbId: 100, title: "Movie A", year: 2020 },
        { tmdbId: 200, title: "Movie B", year: 2021 },
      ]);

      client.getMovies.mockResolvedValue([
        { id: 10, title: "Movie A", year: 2020, tmdbId: 100, hasFile: false, monitored: true },
        { id: 20, title: "Movie B", year: 2021, tmdbId: 200, hasFile: false, monitored: true },
      ]);

      // Movie B has a recent grab, Movie A does not
      client.getMovieHistory.mockImplementation(async (movieId: number) => {
        if (movieId === 20) return [{ id: 1, eventType: "grabbed", date: "2024-06-01" }];
        return [];
      });

      client.getHistoryByDownloadId.mockResolvedValue({
        page: 1, pageSize: 10, totalRecords: 0, records: [],
      });

      await enrichDetectedIssues(arrClient, "radarr", [result]);

      const selectFixes = result.issue.suggestedFixes.filter((f) => f.action === "select_movie_import");
      const movieBFix = selectFixes.find((f) => f.params?.tmdbId === 200);
      expect(movieBFix?.priority).toBe(0); // winner
    });

    it("demotes non-library candidates", async () => {
      const result = makeImportBlockedResult([
        { tmdbId: 100, title: "Movie A", year: 2020 },
        { tmdbId: 200, title: "Not In Library", year: 2021 },
      ]);

      client.getMovies.mockResolvedValue([
        { id: 10, title: "Movie A", year: 2020, tmdbId: 100, hasFile: false, monitored: true },
      ]);

      client.getHistoryByDownloadId.mockResolvedValue({
        page: 1, pageSize: 10, totalRecords: 0, records: [],
      });

      await enrichDetectedIssues(arrClient, "radarr", [result]);

      const notInLibrary = result.issue.suggestedFixes.find((f) => f.params?.tmdbId === 200);
      expect(notInLibrary?.priority).toBe(50);
      expect(notInLibrary?.automatable).toBe(false);
      expect(notInLibrary?.description).toContain("not in library");
    });

    it("handles getMovies failure gracefully", async () => {
      const result = makeImportBlockedResult([
        { tmdbId: 100, title: "Movie A", year: 2020 },
      ]);

      client.getMovies.mockRejectedValue(new Error("Timeout"));
      client.getHistoryByDownloadId.mockResolvedValue({
        page: 1, pageSize: 10, totalRecords: 0, records: [],
      });

      // Should not throw
      await expect(enrichDetectedIssues(arrClient, "radarr", [result])).resolves.toBeUndefined();
    });

    it("skips non-import-blocked issues", async () => {
      const result = makeDetectionResult({
        issue: { type: "failed", suggestedFixes: [] },
      });

      await enrichDetectedIssues(arrClient, "radarr", [result]);
      expect(client.getMovies).not.toHaveBeenCalled();
    });
  });
});
