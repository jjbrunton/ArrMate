import { eq } from "drizzle-orm";
import { decrypt } from "../crypto";
import { getDb } from "../db";
import { importedRequests, instances, type ImportedRequest, type Instance } from "../db/schema";
import { isArrInstanceType } from "../instances/definitions";
import { OverseerrClient } from "../overseerr-client/client";
import type { OverseerrRequestRecord } from "../overseerr-client/types";
import { writeAuditLog } from "./issue-service";
import { createLogger } from "../utils/logger";

const log = createLogger("request-service");

const REQUEST_STATUS_PENDING = 1;
const REQUEST_STATUS_APPROVED = 2;
const REQUEST_STATUS_DECLINED = 3;
const REQUEST_STATUS_FAILED = 4;
const REQUEST_STATUS_AVAILABLE = 5;

const MEDIA_STATUS_PENDING = 2;
const MEDIA_STATUS_PROCESSING = 3;
const MEDIA_STATUS_PARTIALLY_AVAILABLE = 4;
const MEDIA_STATUS_AVAILABLE = 5;

const AVAILABLE_STATUSES = new Set(["available", "partially available"]);
const PENDING_STATUSES = new Set(["pending approval", "pending", "processing", "approved"]);

export interface ImportedRequestInput {
  externalId: number;
  mediaType: "movie" | "tv";
  title: string;
  tmdbId?: number | null;
  requestStatus?: number | null;
  mediaStatus?: number | null;
  status: string;
  requestedByDisplayName: string;
  requestedByEmail?: string | null;
  requestedAt?: string | null;
  updatedAt: string;
}

export interface ImportedRequestStats {
  instanceId: number;
  totalRequests: number;
  pendingRequests: number;
  availableRequests: number;
}

type SyncClient = Pick<OverseerrClient, "getAllRequests" | "getMovieDetails" | "getTvDetails">;

function normalizeRequester(record: OverseerrRequestRecord) {
  return {
    requestedByDisplayName:
      record.requestedBy?.displayName
      || record.requestedBy?.username
      || record.requestedBy?.email
      || "Unknown user",
    requestedByEmail: record.requestedBy?.email ?? null,
  };
}

export function getRequestDisplayStatus(requestStatus?: number | null, mediaStatus?: number | null): string {
  if (requestStatus === REQUEST_STATUS_DECLINED) return "declined";
  if (requestStatus === REQUEST_STATUS_FAILED) return "failed";
  if (requestStatus === REQUEST_STATUS_PENDING) return "pending approval";
  if (requestStatus === REQUEST_STATUS_AVAILABLE || mediaStatus === MEDIA_STATUS_AVAILABLE) return "available";
  if (mediaStatus === MEDIA_STATUS_PARTIALLY_AVAILABLE) return "partially available";
  if (mediaStatus === MEDIA_STATUS_PROCESSING) return "processing";
  if (requestStatus === REQUEST_STATUS_APPROVED) return "approved";
  if (mediaStatus === MEDIA_STATUS_PENDING) return "pending";
  return "requested";
}

async function resolveRequestTitle(
  client: SyncClient,
  request: OverseerrRequestRecord,
  titleCache: Map<string, string>,
): Promise<string> {
  const mediaType = request.type ?? request.media?.mediaType;
  const tmdbId = request.media?.tmdbId;

  if (!mediaType || !tmdbId) {
    return `Request #${request.id}`;
  }

  const cacheKey = `${mediaType}:${tmdbId}`;
  const cached = titleCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  try {
    const title = mediaType === "movie"
      ? (await client.getMovieDetails(tmdbId)).title
      : (await client.getTvDetails(tmdbId)).name;

    titleCache.set(cacheKey, title);
    return title;
  } catch (err) {
    log.warn({ requestId: request.id, mediaType, tmdbId, err }, "Failed to resolve request title");
    return `Request #${request.id}`;
  }
}

export function syncImportedRequests(instanceId: number, records: ImportedRequestInput[]): ImportedRequest[] {
  const db = getDb();
  const existingRows = db
    .select({ id: importedRequests.id, externalId: importedRequests.externalId })
    .from(importedRequests)
    .where(eq(importedRequests.instanceId, instanceId))
    .all();

  const incomingIds = new Set(records.map((record) => record.externalId));
  const staleIds = existingRows
    .filter((row) => !incomingIds.has(row.externalId))
    .map((row) => row.id);

  if (staleIds.length > 0) {
    for (const id of staleIds) {
      db.delete(importedRequests).where(eq(importedRequests.id, id)).run();
    }
  }

  for (const record of records) {
    db.insert(importedRequests)
      .values({
        instanceId,
        externalId: record.externalId,
        mediaType: record.mediaType,
        title: record.title,
        tmdbId: record.tmdbId ?? null,
        requestStatus: record.requestStatus ?? null,
        mediaStatus: record.mediaStatus ?? null,
        status: record.status,
        requestedByDisplayName: record.requestedByDisplayName,
        requestedByEmail: record.requestedByEmail ?? null,
        requestedAt: record.requestedAt ?? null,
        updatedAt: record.updatedAt,
      })
      .onConflictDoUpdate({
        target: [importedRequests.instanceId, importedRequests.externalId],
        set: {
          mediaType: record.mediaType,
          title: record.title,
          tmdbId: record.tmdbId ?? null,
          requestStatus: record.requestStatus ?? null,
          mediaStatus: record.mediaStatus ?? null,
          status: record.status,
          requestedByDisplayName: record.requestedByDisplayName,
          requestedByEmail: record.requestedByEmail ?? null,
          requestedAt: record.requestedAt ?? null,
          updatedAt: record.updatedAt,
        },
      })
      .run();
  }

  return listImportedRequests(instanceId);
}

export function listImportedRequests(instanceId: number): ImportedRequest[] {
  return getDb()
    .select()
    .from(importedRequests)
    .where(eq(importedRequests.instanceId, instanceId))
    .orderBy(importedRequests.requestedAt, importedRequests.updatedAt)
    .all()
    .reverse();
}

export function getImportedRequestStats(instanceId: number): ImportedRequestStats {
  const rows = getDb()
    .select({
      status: importedRequests.status,
    })
    .from(importedRequests)
    .where(eq(importedRequests.instanceId, instanceId))
    .all();

  return {
    instanceId,
    totalRequests: rows.length,
    pendingRequests: rows.filter((row) => PENDING_STATUSES.has(row.status)).length,
    availableRequests: rows.filter((row) => AVAILABLE_STATUSES.has(row.status)).length,
  };
}

export function getAllImportedRequestStats(): ImportedRequestStats[] {
  const rows = getDb()
    .select({
      instanceId: importedRequests.instanceId,
      status: importedRequests.status,
    })
    .from(importedRequests)
    .all();

  const grouped = new Map<number, ImportedRequestStats>();

  for (const row of rows) {
    const current = grouped.get(row.instanceId) ?? {
      instanceId: row.instanceId,
      totalRequests: 0,
      pendingRequests: 0,
      availableRequests: 0,
    };

    current.totalRequests += 1;
    if (PENDING_STATUSES.has(row.status)) current.pendingRequests += 1;
    if (AVAILABLE_STATUSES.has(row.status)) current.availableRequests += 1;
    grouped.set(row.instanceId, current);
  }

  return Array.from(grouped.values());
}

export async function syncOverseerrRequests(instance: Instance, client?: SyncClient): Promise<ImportedRequest[]> {
  const db = getDb();
  const freshInstance = db.select().from(instances).where(eq(instances.id, instance.id)).get() ?? instance;

  if (isArrInstanceType(freshInstance.type)) {
    throw new Error("Request sync is only supported for Overseerr instances");
  }

  try {
    const syncClient = client ?? new OverseerrClient(freshInstance.baseUrl, decrypt(freshInstance.apiKey));
    const fetchedRequests = await syncClient.getAllRequests();
    const titleCache = new Map<string, string>();

    const rows: ImportedRequestInput[] = [];
    for (const request of fetchedRequests) {
      const mediaType = request.type ?? request.media?.mediaType;
      if (mediaType !== "movie" && mediaType !== "tv") {
        continue;
      }

      const requester = normalizeRequester(request);
      rows.push({
        externalId: request.id,
        mediaType,
        title: await resolveRequestTitle(syncClient, request, titleCache),
        tmdbId: request.media?.tmdbId ?? null,
        requestStatus: request.status ?? null,
        mediaStatus: request.media?.status ?? null,
        status: getRequestDisplayStatus(request.status, request.media?.status),
        requestedByDisplayName: requester.requestedByDisplayName,
        requestedByEmail: requester.requestedByEmail,
        requestedAt: request.createdAt ?? null,
        updatedAt: request.updatedAt ?? request.createdAt ?? new Date().toISOString(),
      });
    }

    const imported = syncImportedRequests(freshInstance.id, rows);
    const syncedAt = new Date().toISOString();

    db.update(instances)
      .set({ lastRequestSyncAt: syncedAt })
      .where(eq(instances.id, freshInstance.id))
      .run();

    writeAuditLog({
      instanceId: freshInstance.id,
      action: "request_sync",
      source: "system",
      details: {
        requestCount: imported.length,
      },
    });

    log.info({ instanceId: freshInstance.id, requestCount: imported.length }, "Imported Overseerr requests");

    return imported;
  } catch (err) {
    writeAuditLog({
      instanceId: freshInstance.id,
      action: "request_sync_failed",
      source: "system",
      details: { error: err instanceof Error ? err.message : String(err) },
    });

    throw err;
  }
}
