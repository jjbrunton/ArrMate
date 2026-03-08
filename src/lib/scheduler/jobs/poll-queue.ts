import { eq } from "drizzle-orm";
import { ArrClient } from "../../arr-client/client";
import { decrypt } from "../../crypto";
import { getDb } from "../../db";
import { instances as instancesTable } from "../../db/schema";
import { syncQueueItems } from "../../services/queue-service";
import { detectIssues } from "../../issues/detector";
import { enrichDetectedIssues } from "../../issues/enrichment";
import { persistDetectedIssues, resolveIssuesForGoneItems, getActiveIssues, writeAuditLog } from "../../services/issue-service";
import { getQueueItems } from "../../services/queue-service";
import { selectBestFixes, executeAndRecordFix } from "../../issues/fix-executor";
import type { Instance } from "../../db/schema";
import { createLogger } from "../../utils/logger";

const log = createLogger("poll-queue");

export async function pollQueue(instance: Instance) {
  log.info({ instanceId: instance.id, name: instance.name }, "Polling queue");

  try {
    // Re-read instance from DB to get fresh settings (e.g. autoFix toggled since scheduling)
    const freshInstance = getDb().select().from(instancesTable).where(eq(instancesTable.id, instance.id)).get();
    if (freshInstance) {
      instance = freshInstance;
    }

    const apiKey = decrypt(instance.apiKey);
    const client = new ArrClient(instance.baseUrl, apiKey, instance.type as "sonarr" | "radarr");
    const records = await client.getAllQueueItems();

    log.info(
      { instanceId: instance.id, recordCount: records.length },
      "Fetched queue records",
    );

    writeAuditLog({
      instanceId: instance.id,
      action: "queue_sync",
      source: "system",
      details: { recordCount: records.length },
    });

    // Sync queue items to DB
    syncQueueItems(instance.id, records);

    // Record poll timestamp
    const db = getDb();
    db.update(instancesTable)
      .set({ lastPolledAt: new Date().toISOString() })
      .where(eq(instancesTable.id, instance.id))
      .run();

    // Auto-resolve issues for items that have left the queue
    resolveIssuesForGoneItems(instance.id);

    // Run issue detection on current items
    const currentItems = getQueueItems(instance.id);
    const detectionResults = detectIssues(currentItems, {
      instanceId: instance.id,
      instanceType: instance.type as "sonarr" | "radarr",
    });

    // Enrich issues with library data and grab history
    if (detectionResults.length > 0) {
      await enrichDetectedIssues(client, instance.type as "sonarr" | "radarr", detectionResults);
    }

    if (detectionResults.length > 0) {
      log.info(
        { instanceId: instance.id, issueCount: detectionResults.length },
        "Detected issues",
      );
      persistDetectedIssues(instance.id, detectionResults);

      writeAuditLog({
        instanceId: instance.id,
        action: "issues_detected",
        source: "system",
        details: {
          issueCount: detectionResults.length,
          types: detectionResults.map((r) => r.issue.type),
        },
      });
    }

    // Auto-fix: if enabled, execute the highest-priority automatable fix for each active issue
    if (instance.autoFix) {
      await autoFixIssues(instance, client);
    }
  } catch (err) {
    log.error({ instanceId: instance.id, err }, "Failed to poll queue");

    writeAuditLog({
      instanceId: instance.id,
      action: "queue_sync_failed",
      source: "system",
      details: { error: err instanceof Error ? err.message : String(err) },
    });
  }
}

async function autoFixIssues(instance: Instance, client: ArrClient) {
  const issues = getActiveIssues(instance.id);
  const toExecute = selectBestFixes(issues);

  if (toExecute.length === 0) return;

  log.info({ instanceId: instance.id, count: toExecute.length }, "Auto-fixing issues");

  let succeeded = 0;
  for (const { issue, fix } of toExecute) {
    try {
      const result = await executeAndRecordFix(client, instance, issue, fix, "automation", { trigger: "auto_fix" });
      if (result.success) succeeded++;
    } catch (err) {
      log.error({ instanceId: instance.id, issueId: issue.id, err }, "Auto-fix failed");
    }
  }

  if (toExecute.length > 0) {
    writeAuditLog({
      instanceId: instance.id,
      action: "auto_fix_batch",
      source: "automation",
      details: { total: toExecute.length, succeeded, failed: toExecute.length - succeeded },
    });
  }
}
