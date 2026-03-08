import { eq, and, count } from "drizzle-orm";
import { getDb } from "../db";
import { queueItems, type QueueItem } from "../db/schema";
import type { QueueRecord } from "../arr-client/types";

export function getQueueItems(instanceId: number, includeGone = false): QueueItem[] {
  const db = getDb();
  const conditions = includeGone
    ? eq(queueItems.instanceId, instanceId)
    : and(eq(queueItems.instanceId, instanceId), eq(queueItems.isGone, false));

  return db.select().from(queueItems).where(conditions).all();
}

export function syncQueueItems(instanceId: number, records: QueueRecord[]): QueueItem[] {
  const db = getDb();
  const now = new Date().toISOString();
  const externalIds = new Set(records.map((r) => r.id));

  // Mark items that are no longer in the queue as gone
  const existing = db
    .select()
    .from(queueItems)
    .where(eq(queueItems.instanceId, instanceId))
    .all();

  for (const item of existing) {
    if (!externalIds.has(item.externalId) && !item.isGone) {
      db.update(queueItems)
        .set({ isGone: true, lastSeenAt: now })
        .where(eq(queueItems.id, item.id))
        .run();
    }
  }

  // Upsert current queue items
  for (const record of records) {
    const existingItem = existing.find(
      (e) => e.externalId === record.id && e.instanceId === instanceId,
    );

    const statusMessages = record.statusMessages
      ? JSON.stringify(record.statusMessages)
      : null;

    if (existingItem) {
      db.update(queueItems)
        .set({
          title: record.title,
          status: record.status,
          trackedDownloadState: record.trackedDownloadState,
          trackedDownloadStatus: record.trackedDownloadStatus,
          statusMessages,
          protocol: record.protocol,
          downloadClient: record.downloadClient,
          sizeBytes: record.size,
          sizeLeftBytes: record.sizeleft,
          timeleft: record.timeleft,
          estimatedCompletionTime: record.estimatedCompletionTime,
          downloadId: record.downloadId || null,
          outputPath: record.outputPath || null,
          lastSeenAt: now,
          isGone: false,
        })
        .where(eq(queueItems.id, existingItem.id))
        .run();
    } else {
      db.insert(queueItems)
        .values({
          instanceId,
          externalId: record.id,
          title: record.title,
          status: record.status,
          trackedDownloadState: record.trackedDownloadState,
          trackedDownloadStatus: record.trackedDownloadStatus,
          statusMessages,
          protocol: record.protocol,
          downloadClient: record.downloadClient,
          sizeBytes: record.size,
          sizeLeftBytes: record.sizeleft,
          timeleft: record.timeleft,
          estimatedCompletionTime: record.estimatedCompletionTime,
          downloadId: record.downloadId || null,
          outputPath: record.outputPath || null,
          firstSeenAt: now,
          lastSeenAt: now,
        })
        .run();
    }
  }

  return getQueueItems(instanceId);
}

export function getQueueItem(id: number): QueueItem | undefined {
  const db = getDb();
  return db.select().from(queueItems).where(eq(queueItems.id, id)).get();
}

export function getQueueItemByExternalId(instanceId: number, externalId: number): QueueItem | undefined {
  const db = getDb();
  return db
    .select()
    .from(queueItems)
    .where(and(eq(queueItems.instanceId, instanceId), eq(queueItems.externalId, externalId)))
    .get();
}

export function getAllQueueItemCounts(): { instanceId: number; count: number }[] {
  const db = getDb();
  return db
    .select({
      instanceId: queueItems.instanceId,
      count: count(),
    })
    .from(queueItems)
    .where(eq(queueItems.isGone, false))
    .groupBy(queueItems.instanceId)
    .all();
}
