import { describe, it, expect, vi } from "vitest";
import { selectBestFixes, buildFixParams } from "./fix-executor";
import type { IssueWithFixes } from "../services/issue-service";
import type { SuggestedFix, DetectedIssue } from "../db/schema";

vi.mock("../services/queue-service", () => ({
  getQueueItemByExternalId: vi.fn().mockReturnValue({
    downloadId: "dl-123",
    outputPath: "/downloads/test",
  }),
}));

function makeFix(overrides: Partial<SuggestedFix> = {}): SuggestedFix {
  return {
    id: 1,
    issueId: 1,
    action: "remove_and_blocklist",
    label: "Blocklist",
    description: "Blocklist and search",
    priority: 1,
    automatable: true,
    params: null,
    executedAt: null,
    executionResult: null,
    ...overrides,
  };
}

function makeIssue(overrides: Partial<DetectedIssue> = {}, fixes: SuggestedFix[] = []): IssueWithFixes {
  return {
    id: 1,
    instanceId: 1,
    queueItemId: 1,
    externalQueueId: 100,
    type: "stalled",
    severity: "warning",
    title: "Test issue",
    description: "Test desc",
    status: "active",
    detectedAt: new Date().toISOString(),
    resolvedAt: null,
    fixes,
    ...overrides,
  };
}

describe("selectBestFixes", () => {
  it("returns empty array for no issues", () => {
    expect(selectBestFixes([])).toEqual([]);
  });

  it("selects highest-priority automatable fix", () => {
    const fix1 = makeFix({ id: 1, priority: 2, automatable: true });
    const fix2 = makeFix({ id: 2, priority: 1, automatable: true });
    const issue = makeIssue({}, [fix1, fix2]);

    const result = selectBestFixes([issue]);
    expect(result).toHaveLength(1);
    expect(result[0].fix.id).toBe(2); // lower priority number = higher priority
  });

  it("skips non-automatable fixes", () => {
    const fix1 = makeFix({ id: 1, priority: 1, automatable: false });
    const fix2 = makeFix({ id: 2, priority: 2, automatable: true });
    const issue = makeIssue({}, [fix1, fix2]);

    const result = selectBestFixes([issue]);
    expect(result[0].fix.id).toBe(2);
  });

  it("skips already-executed fixes", () => {
    const fix1 = makeFix({ id: 1, priority: 1, executedAt: new Date().toISOString() });
    const fix2 = makeFix({ id: 2, priority: 2 });
    const issue = makeIssue({}, [fix1, fix2]);

    const result = selectBestFixes([issue]);
    expect(result[0].fix.id).toBe(2);
  });

  it("excludes issues with no eligible fixes", () => {
    const fix1 = makeFix({ automatable: false });
    const issue = makeIssue({}, [fix1]);

    expect(selectBestFixes([issue])).toEqual([]);
  });
});

describe("buildFixParams", () => {
  it("returns empty object for fix with no params", () => {
    const fix = makeFix({ action: "remove_and_blocklist", params: null });
    const result = buildFixParams(fix, 1, 100);
    expect(result).toEqual({});
  });

  it("parses stored JSON params", () => {
    const fix = makeFix({ params: JSON.stringify({ tmdbId: 123 }) });
    const result = buildFixParams(fix, 1, 100);
    expect(result.tmdbId).toBe(123);
  });

  it("adds downloadId and outputPath for select_movie_import", () => {
    const fix = makeFix({
      action: "select_movie_import",
      params: JSON.stringify({ tmdbId: 123 }),
    });
    const result = buildFixParams(fix, 1, 100);
    expect(result.downloadId).toBe("dl-123");
    expect(result.outputPath).toBe("/downloads/test");
  });
});
