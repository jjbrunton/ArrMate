import { eq, and, count } from "drizzle-orm";
import { getDb } from "../db";
import { auditLog, instances, queueItems, detectedIssues, type Instance, type NewInstance } from "../db/schema";
import { encrypt, decrypt } from "../crypto";
import { verifyInstanceConnection } from "../instances/connection";
import type { InstanceType } from "../instances/definitions";

export type InstancePublic = Omit<Instance, "apiKey">;

function toPublic(instance: Instance): InstancePublic {
  const rest = { ...instance } as Partial<Instance>;
  delete rest.apiKey;
  return rest as InstancePublic;
}

export function listInstances(): InstancePublic[] {
  const db = getDb();
  return db.select().from(instances).all().map(toPublic);
}

export function getInstance(id: number): InstancePublic | undefined {
  const db = getDb();
  const row = db.select().from(instances).where(eq(instances.id, id)).get();
  return row ? toPublic(row) : undefined;
}

export function getInstanceWithKey(id: number): Instance | undefined {
  const db = getDb();
  return db.select().from(instances).where(eq(instances.id, id)).get();
}

export async function createInstance(data: {
  name: string;
  type: InstanceType;
  baseUrl: string;
  apiKey: string;
  pollIntervalSeconds?: number;
  qualityCheckMaxItems?: number;
  mediaSyncIntervalSeconds?: number;
  requestSyncIntervalSeconds?: number;
  autoFix?: boolean;
}): Promise<InstancePublic> {
  // Verify connection first
  await verifyInstanceConnection(data.type, data.baseUrl, data.apiKey);

  const db = getDb();
  const encrypted = encrypt(data.apiKey);

  const result = db
    .insert(instances)
    .values({
      name: data.name,
      type: data.type,
      baseUrl: data.baseUrl,
      apiKey: encrypted,
      pollIntervalSeconds: data.pollIntervalSeconds || 300,
      qualityCheckMaxItems: data.qualityCheckMaxItems || 50,
      mediaSyncIntervalSeconds: data.mediaSyncIntervalSeconds || 3600,
      requestSyncIntervalSeconds: data.type === "overseerr"
        ? (data.requestSyncIntervalSeconds || 300)
        : null,
      autoFix: data.autoFix ?? false,
    })
    .returning()
    .get();

  return toPublic(result);
}

export async function updateInstance(
  id: number,
  data: {
    name?: string;
    baseUrl?: string;
    apiKey?: string;
    pollIntervalSeconds?: number;
    qualityCheckMaxItems?: number;
    mediaSyncIntervalSeconds?: number;
    requestSyncIntervalSeconds?: number | null;
    enabled?: boolean;
    autoFix?: boolean;
  },
): Promise<InstancePublic | undefined> {
  const db = getDb();
  const existing = db.select().from(instances).where(eq(instances.id, id)).get();
  if (!existing) return undefined;

  // If URL or API key changed, verify connection
  const newUrl = data.baseUrl || existing.baseUrl;
  const newKey = data.apiKey || decrypt(existing.apiKey);
  if (data.baseUrl || data.apiKey) {
    await verifyInstanceConnection(existing.type, newUrl, newKey);
  }

  const updates: Partial<NewInstance> = {
    updatedAt: new Date().toISOString(),
  };
  if (data.name !== undefined) updates.name = data.name;
  if (data.baseUrl !== undefined) updates.baseUrl = data.baseUrl;
  if (data.apiKey !== undefined) updates.apiKey = encrypt(data.apiKey);
  if (data.pollIntervalSeconds !== undefined) updates.pollIntervalSeconds = data.pollIntervalSeconds;
  if (data.qualityCheckMaxItems !== undefined) updates.qualityCheckMaxItems = data.qualityCheckMaxItems;
  if (data.mediaSyncIntervalSeconds !== undefined) updates.mediaSyncIntervalSeconds = data.mediaSyncIntervalSeconds;
  if (data.requestSyncIntervalSeconds !== undefined) updates.requestSyncIntervalSeconds = data.requestSyncIntervalSeconds;
  if (data.enabled !== undefined) updates.enabled = data.enabled;
  if (data.autoFix !== undefined) updates.autoFix = data.autoFix;

  const result = db.update(instances).set(updates).where(eq(instances.id, id)).returning().get();
  return result ? toPublic(result) : undefined;
}

export function deleteInstance(id: number): boolean {
  const db = getDb();
  return db.transaction((tx) => {
    tx.delete(auditLog).where(eq(auditLog.instanceId, id)).run();

    const result = tx.delete(instances).where(eq(instances.id, id)).returning().get();
    return !!result;
  });
}

export async function verifyConnection(type: InstanceType, baseUrl: string, apiKey: string) {
  return verifyInstanceConnection(type, baseUrl, apiKey);
}

export function getInstanceStats(id: number) {
  const db = getDb();

  const queueResult = db
    .select({ value: count() })
    .from(queueItems)
    .where(and(eq(queueItems.instanceId, id), eq(queueItems.isGone, false)))
    .get()!;

  const issueResult = db
    .select({ value: count() })
    .from(detectedIssues)
    .where(and(eq(detectedIssues.instanceId, id), eq(detectedIssues.status, "active")))
    .get()!;

  return { queueCount: queueResult.value, activeIssues: issueResult.value };
}
