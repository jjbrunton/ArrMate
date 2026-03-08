import { describe, it, expect } from "vitest";
import { importPendingRule } from "./import-pending";
import { makeQueueItem, makeContext } from "../../test-utils/fixtures";

const ctx = makeContext();

describe("importPendingRule", () => {
  it("has correct name and priority", () => {
    expect(importPendingRule.name).toBe("import_pending");
    expect(importPendingRule.priority).toBe(60);
  });

  it("detects importpending state after 30 min", () => {
    const item = makeQueueItem({
      trackedDownloadState: "importPending",
      firstSeenAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    });
    const result = importPendingRule.analyze(item, ctx);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("import_pending");
    expect(result!.severity).toBe("warning");
  });

  it("detects importpending status after 30 min", () => {
    const item = makeQueueItem({
      trackedDownloadState: "downloading",
      trackedDownloadStatus: "importPending",
      firstSeenAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    });
    const result = importPendingRule.analyze(item, ctx);
    expect(result).not.toBeNull();
  });

  it("does NOT flag under 30 min", () => {
    const item = makeQueueItem({
      trackedDownloadState: "importPending",
      firstSeenAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    });
    expect(importPendingRule.analyze(item, ctx)).toBeNull();
  });

  it("returns null for non-pending state", () => {
    const item = makeQueueItem({
      trackedDownloadState: "downloading",
      trackedDownloadStatus: "ok",
    });
    expect(importPendingRule.analyze(item, ctx)).toBeNull();
  });

  it("suggests force_import first", () => {
    const item = makeQueueItem({
      trackedDownloadState: "importPending",
      firstSeenAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });
    const result = importPendingRule.analyze(item, ctx)!;
    expect(result.suggestedFixes[0].action).toBe("force_import");
    expect(result.suggestedFixes).toHaveLength(2);
  });
});
