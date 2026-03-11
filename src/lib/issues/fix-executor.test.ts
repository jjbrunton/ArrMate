import { beforeEach, describe, it, expect, vi } from "vitest";
import { selectBestFixes, buildFixParams, executeAndRecordFix } from "./fix-executor";
import type { IssueWithFixes } from "../services/issue-service";
import type { SuggestedFix, DetectedIssue, Instance } from "../db/schema";
import type { ArrClient } from "../arr-client/client";
import { DEFAULT_QUALITY_CHECK_STRATEGY } from "../quality-check-strategy";

const {
  executeFixMock,
  markFixExecutedMock,
  resolveIssueMock,
  writeAuditLogMock,
  getQueueItemByExternalIdMock,
} = vi.hoisted(() => ({
  executeFixMock: vi.fn(),
  markFixExecutedMock: vi.fn(),
  resolveIssueMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  getQueueItemByExternalIdMock: vi.fn(),
}));

vi.mock("../services/queue-service", () => ({
  getQueueItemByExternalId: getQueueItemByExternalIdMock,
}));

vi.mock("./fixes", () => ({
  executeFix: executeFixMock,
}));

vi.mock("../services/issue-service", () => ({
  markFixExecuted: markFixExecutedMock,
  resolveIssue: resolveIssueMock,
  writeAuditLog: writeAuditLogMock,
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

function makeInstance(overrides: Partial<Instance> = {}): Instance {
  return {
    id: 1,
    name: "Radarr",
    type: "radarr",
    baseUrl: "http://localhost:7878",
    apiKey: "encrypted-key",
    pollIntervalSeconds: 300,
    qualityCheckIntervalSeconds: 1800,
    qualityCheckMaxItems: 50,
    qualityCheckStrategy: DEFAULT_QUALITY_CHECK_STRATEGY,
    enabled: true,
    autoFix: false,
    lastHealthCheck: null,
    lastHealthStatus: "unknown",
    lastPolledAt: null,
    lastQualityCheckAt: null,
    mediaSyncIntervalSeconds: 3600,
    lastMediaSyncAt: null,
    requestSyncIntervalSeconds: null,
    lastRequestSyncAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getQueueItemByExternalIdMock.mockReturnValue({
    downloadId: "dl-123",
    outputPath: "/downloads/test",
  });
});

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

  it("adds downloadId and outputPath for force_import", () => {
    const fix = makeFix({
      action: "force_import",
      params: null,
    });
    const result = buildFixParams(fix, 1, 100);
    expect(result.downloadId).toBe("dl-123");
    expect(result.outputPath).toBe("/downloads/test");
  });
});

describe("executeAndRecordFix", () => {
  it("returns early when issue has no external queue ID", async () => {
    const result = await executeAndRecordFix(
      {} as ArrClient,
      makeInstance(),
      makeIssue({ externalQueueId: null }),
      makeFix(),
      "user",
    );

    expect(result).toEqual({
      issueId: 1,
      fixId: 1,
      success: false,
      message: "No external queue ID",
    });
    expect(executeFixMock).not.toHaveBeenCalled();
    expect(markFixExecutedMock).not.toHaveBeenCalled();
    expect(resolveIssueMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("records and resolves successful fix execution", async () => {
    executeFixMock.mockResolvedValueOnce({ success: true, message: "Imported" });

    const fix = makeFix({ action: "force_import" });
    const result = await executeAndRecordFix(
      {} as ArrClient,
      makeInstance(),
      makeIssue(),
      fix,
      "automation",
      { batchId: "batch-1" },
    );

    expect(executeFixMock).toHaveBeenCalledWith(
      expect.anything(),
      100,
      "force_import",
      { downloadId: "dl-123", outputPath: "/downloads/test" },
    );
    expect(markFixExecutedMock).toHaveBeenCalledWith(
      1,
      JSON.stringify({ success: true, message: "Imported" }),
    );
    expect(resolveIssueMock).toHaveBeenCalledWith(1);
    expect(writeAuditLogMock).toHaveBeenCalledWith({
      instanceId: 1,
      issueId: 1,
      action: "fix_force_import",
      source: "automation",
      details: {
        fixId: 1,
        result: { success: true, message: "Imported" },
        batchId: "batch-1",
      },
    });
    expect(result).toEqual({
      issueId: 1,
      fixId: 1,
      success: true,
      message: "Imported",
    });
  });

  it("records failed executions without resolving the issue", async () => {
    executeFixMock.mockResolvedValueOnce({ success: false, message: "Import failed" });

    await executeAndRecordFix(
      {} as ArrClient,
      makeInstance(),
      makeIssue(),
      makeFix({ action: "force_import" }),
      "user",
    );

    expect(markFixExecutedMock).toHaveBeenCalledWith(
      1,
      JSON.stringify({ success: false, message: "Import failed" }),
    );
    expect(resolveIssueMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).toHaveBeenCalledOnce();
  });
});
