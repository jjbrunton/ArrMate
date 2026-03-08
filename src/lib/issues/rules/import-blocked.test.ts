import { describe, it, expect } from "vitest";
import { importBlockedRule, parseMultipleMovieCandidates } from "./import-blocked";
import { makeQueueItem, makeStatusMessages, makeContext } from "../../test-utils/fixtures";

const ctx = makeContext();

describe("importBlockedRule", () => {
  it("has correct name and priority", () => {
    expect(importBlockedRule.name).toBe("import_blocked");
    expect(importBlockedRule.priority).toBe(75);
  });

  it("detects importblocked state", () => {
    const item = makeQueueItem({
      trackedDownloadState: "importBlocked",
      statusMessages: makeStatusMessages(["Unable to import: path does not exist"]),
    });
    const result = importBlockedRule.analyze(item, ctx);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("import_blocked");
    expect(result!.severity).toBe("critical");
  });

  it("detects found multiple movies with candidates", () => {
    const item = makeQueueItem({
      trackedDownloadState: "importBlocked",
      statusMessages: makeStatusMessages([
        "Found multiple movies: [Movie A (2020)][tt1234567, 12345] [Movie B (2021)][tt7654321, 67890]",
      ]),
    });
    const result = importBlockedRule.analyze(item, ctx);
    expect(result).not.toBeNull();
    expect(result!.title).toContain("Multiple matches");
    // Should have 2 select_movie_import + 2 fallback fixes
    const selectFixes = result!.suggestedFixes.filter((f) => f.action === "select_movie_import");
    expect(selectFixes).toHaveLength(2);
    expect(selectFixes[0].params).toEqual({
      tmdbId: 12345,
      imdbId: "tt1234567",
      title: "Movie A",
      year: 2020,
    });
  });

  it("detects warning status with import keywords", () => {
    const item = makeQueueItem({
      trackedDownloadState: "downloading",
      trackedDownloadStatus: "warning",
      statusMessages: makeStatusMessages(["Unable to import: file locked"]),
    });
    const result = importBlockedRule.analyze(item, ctx);
    expect(result).not.toBeNull();
    expect(result!.severity).toBe("warning");
  });

  it("returns null for normal downloading", () => {
    const item = makeQueueItem({
      trackedDownloadState: "downloading",
      trackedDownloadStatus: "ok",
      statusMessages: null,
    });
    expect(importBlockedRule.analyze(item, ctx)).toBeNull();
  });

  it("returns null for warning without import keywords", () => {
    const item = makeQueueItem({
      trackedDownloadState: "downloading",
      trackedDownloadStatus: "warning",
      statusMessages: makeStatusMessages(["Some random warning"]),
    });
    expect(importBlockedRule.analyze(item, ctx)).toBeNull();
  });

  it("includes force_import for blocked without multiple movies", () => {
    const item = makeQueueItem({
      trackedDownloadState: "importBlocked",
      statusMessages: makeStatusMessages(["Generic import error"]),
    });
    const result = importBlockedRule.analyze(item, ctx)!;
    expect(result.suggestedFixes[0].action).toBe("force_import");
  });
});

describe("parseMultipleMovieCandidates", () => {
  it("parses Radarr candidate format", () => {
    const messages = ["Found multiple movies: [Die Hard (1988)][tt0095016, 562] [Die Hard 2 (1990)][tt0099423, 1573]"];
    const candidates = parseMultipleMovieCandidates(messages);
    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toEqual({
      title: "Die Hard",
      year: 1988,
      imdbId: "tt0095016",
      tmdbId: 562,
    });
    expect(candidates[1]).toEqual({
      title: "Die Hard 2",
      year: 1990,
      imdbId: "tt0099423",
      tmdbId: 1573,
    });
  });

  it("returns empty array for no matches", () => {
    expect(parseMultipleMovieCandidates(["No candidates here"])).toEqual([]);
  });

  it("handles single candidate", () => {
    const messages = ["Found multiple movies: [Solo (2018)][tt3778644, 348350]"];
    const candidates = parseMultipleMovieCandidates(messages);
    expect(candidates).toHaveLength(1);
  });
});
