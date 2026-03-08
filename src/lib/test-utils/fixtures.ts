import type { QueueItem, Instance } from "../db/schema";
import type { QueueRecord } from "../arr-client/types";
import type { IssueContext } from "../issues/types";
import type { InstanceType } from "../instances/definitions";

let nextId = 1;
function id() { return nextId++; }

export function resetIdCounter() { nextId = 1; }

export function makeQueueItem(overrides: Partial<QueueItem> = {}): QueueItem {
  const itemId = id();
  return {
    id: itemId,
    instanceId: 1,
    externalId: itemId * 100,
    title: `Test Download ${itemId}`,
    status: "downloading",
    trackedDownloadState: "downloading",
    trackedDownloadStatus: "ok",
    statusMessages: null,
    protocol: "torrent",
    downloadClient: "qBittorrent",
    sizeBytes: 1_000_000_000,
    sizeLeftBytes: 500_000_000,
    timeleft: "01:00:00",
    estimatedCompletionTime: null,
    downloadId: `dl-${itemId}`,
    outputPath: `/downloads/test-${itemId}`,
    firstSeenAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    lastSeenAt: new Date().toISOString(),
    isGone: false,
    ...overrides,
  };
}

export function makeQueueRecord(overrides: Partial<QueueRecord> = {}): QueueRecord {
  const recordId = id();
  return {
    id: recordId,
    title: `Test Record ${recordId}`,
    status: "downloading",
    trackedDownloadState: "downloading",
    trackedDownloadStatus: "ok",
    statusMessages: [],
    protocol: "torrent",
    downloadClient: "qBittorrent",
    size: 1_000_000_000,
    sizeleft: 500_000_000,
    timeleft: "01:00:00",
    estimatedCompletionTime: null,
    ...overrides,
  };
}

export function makeStatusMessages(messages: string[]): string {
  return JSON.stringify(
    messages.map((msg) => ({ title: msg, messages: [] }))
  );
}

export function makeContext(overrides: Partial<IssueContext> = {}): IssueContext {
  return {
    instanceId: 1,
    instanceType: "radarr",
    ...overrides,
  };
}

export function makeInstance(overrides: Partial<Instance> = {}): Instance {
  const instanceId = id();
  const type = (overrides.type ?? "radarr") as InstanceType;
  return {
    id: instanceId,
    name: `Test Instance ${instanceId}`,
    type,
    baseUrl: "http://localhost:7878",
    apiKey: "encrypted-key",
    pollIntervalSeconds: 300,
    qualityCheckMaxItems: 50,
    enabled: true,
    autoFix: false,
    lastHealthCheck: null,
    lastHealthStatus: "unknown",
    lastPolledAt: null,
    lastQualityCheckAt: null,
    mediaSyncIntervalSeconds: 3600,
    lastMediaSyncAt: null,
    requestSyncIntervalSeconds: type === "overseerr" ? 300 : null,
    lastRequestSyncAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}
