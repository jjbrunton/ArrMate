import { describe, it, expect } from "vitest";
import { failedRule } from "./failed";
import { makeQueueItem, makeContext } from "../../test-utils/fixtures";

const ctx = makeContext();

describe("failedRule", () => {
  it("has correct name and priority", () => {
    expect(failedRule.name).toBe("failed");
    expect(failedRule.priority).toBe(100);
  });

  it("detects failed state", () => {
    const item = makeQueueItem({ trackedDownloadState: "failed" });
    const result = failedRule.analyze(item, ctx);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("failed");
    expect(result!.severity).toBe("critical");
    expect(result!.suggestedFixes).toHaveLength(3);
  });

  it("detects failedPending state (case insensitive)", () => {
    const item = makeQueueItem({ trackedDownloadState: "FailedPending" });
    const result = failedRule.analyze(item, ctx);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("failed");
  });

  it("returns null for downloading state", () => {
    const item = makeQueueItem({ trackedDownloadState: "downloading" });
    expect(failedRule.analyze(item, ctx)).toBeNull();
  });

  it("returns null for null state", () => {
    const item = makeQueueItem({ trackedDownloadState: null });
    expect(failedRule.analyze(item, ctx)).toBeNull();
  });

  it("includes retry_download as first fix", () => {
    const item = makeQueueItem({ trackedDownloadState: "failed" });
    const result = failedRule.analyze(item, ctx)!;
    expect(result.suggestedFixes[0].action).toBe("retry_download");
    expect(result.suggestedFixes[0].automatable).toBe(true);
  });

  it("includes title in issue title", () => {
    const item = makeQueueItem({ trackedDownloadState: "failed", title: "My Movie (2024)" });
    const result = failedRule.analyze(item, ctx)!;
    expect(result.title).toContain("My Movie (2024)");
  });
});
