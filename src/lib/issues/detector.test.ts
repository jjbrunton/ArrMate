import { describe, it, expect } from "vitest";
import { detectIssues } from "./detector";
import { makeQueueItem, makeStatusMessages, makeContext } from "../test-utils/fixtures";

const ctx = makeContext();

describe("detectIssues", () => {
  it("returns empty array for empty input", () => {
    expect(detectIssues([], ctx)).toEqual([]);
  });

  it("returns empty array for healthy items", () => {
    const items = [
      makeQueueItem({ trackedDownloadState: "downloading", statusMessages: null }),
    ];
    expect(detectIssues(items, ctx)).toEqual([]);
  });

  it("detects failed download", () => {
    const items = [makeQueueItem({ trackedDownloadState: "failed" })];
    const results = detectIssues(items, ctx);
    expect(results).toHaveLength(1);
    expect(results[0].issue.type).toBe("failed");
  });

  it("skips gone items", () => {
    const items = [makeQueueItem({ trackedDownloadState: "failed", isGone: true })];
    expect(detectIssues(items, ctx)).toEqual([]);
  });

  it("returns only one issue per item (highest priority wins)", () => {
    // This item has both failed state AND stalled keywords
    // Failed (priority 100) should win over stalled (priority 90)
    const items = [
      makeQueueItem({
        trackedDownloadState: "failed",
        statusMessages: makeStatusMessages(["Download is stalled"]),
      }),
    ];
    const results = detectIssues(items, ctx);
    expect(results).toHaveLength(1);
    expect(results[0].issue.type).toBe("failed"); // higher priority
  });

  it("detects multiple issues across different items", () => {
    const items = [
      makeQueueItem({ trackedDownloadState: "failed" }),
      makeQueueItem({
        trackedDownloadState: "downloading",
        statusMessages: makeStatusMessages(["Duplicate detected"]),
      }),
    ];
    const results = detectIssues(items, ctx);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.issue.type).sort()).toEqual(["duplicate", "failed"]);
  });

  it("associates each result with its queue item", () => {
    const item = makeQueueItem({ trackedDownloadState: "failed", title: "Specific Title" });
    const results = detectIssues([item], ctx);
    expect(results[0].queueItem).toBe(item);
  });

  it("detects import blocked", () => {
    const items = [
      makeQueueItem({
        trackedDownloadState: "importBlocked",
        statusMessages: makeStatusMessages(["Unable to import"]),
      }),
    ];
    const results = detectIssues(items, ctx);
    expect(results).toHaveLength(1);
    expect(results[0].issue.type).toBe("import_blocked");
  });
});
