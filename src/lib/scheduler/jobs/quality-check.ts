import { eq } from "drizzle-orm";
import { ArrClient } from "../../arr-client/client";
import { decrypt } from "../../crypto";
import { getDb } from "../../db";
import { instances as instancesTable, type Instance } from "../../db/schema";
import { writeAuditLog } from "../../services/issue-service";
import {
  getDueQualitySearchRecords,
  recordQualitySearch,
  syncQualitySnapshot,
} from "../../services/quality-service";
import { runExclusive } from "../job-tracker";
import { formatQualitySearchRecordLabel } from "../../services/cutoff-service";
import { createLogger } from "../../utils/logger";

const log = createLogger("quality-check");

export async function runQualityChecks(instance: Instance) {
  log.info({ instanceId: instance.id, name: instance.name }, "Running quality checks");

  try {
    const db = getDb();
    const freshInstance = db.select().from(instancesTable).where(eq(instancesTable.id, instance.id)).get();
    if (freshInstance) {
      instance = freshInstance;
    }
    if (!instance.enabled) return;

    const now = new Date();
    const nowIso = now.toISOString();
    const apiKey = decrypt(instance.apiKey);
    const client = new ArrClient(instance.baseUrl, apiKey, instance.type as "sonarr" | "radarr");
    const [records, qualityProfiles] = await Promise.all([
      client.getAllCutoffUnmetItems(),
      client.getQualityProfiles(),
    ]);

    syncQualitySnapshot(instance.id, instance.type as "sonarr" | "radarr", records, qualityProfiles);

    const dueRecords = getDueQualitySearchRecords(
      instance.id,
      instance.type as "sonarr" | "radarr",
      records,
      instance.qualityCheckMaxItems,
      now,
      instance.qualityCheckStrategy,
    );

    if (dueRecords.length > 0) {
      const sent = await runExclusive(instance.id, "quality-search", async () => {
        const lockedDueRecords = getDueQualitySearchRecords(
          instance.id,
          instance.type as "sonarr" | "radarr",
          records,
          instance.qualityCheckMaxItems,
          now,
          instance.qualityCheckStrategy,
        );

        if (lockedDueRecords.length === 0) return;

        const activeSearchCommands = await client.getActiveSearchCommands();
        if (activeSearchCommands.length > 0) {
          log.info(
            {
              instanceId: instance.id,
              activeSearchCommands,
            },
            "Skipping upgrade search requests because Arr is already processing search commands",
          );
          return;
        }

        const itemIds = lockedDueRecords.map((record) => record.id);
        const requestedItems = lockedDueRecords.map((record) => ({
          id: record.id,
          label: formatQualitySearchRecordLabel(instance.type as "sonarr" | "radarr", record),
        }));
        log.info(
          {
            instanceId: instance.id,
            requestedCount: requestedItems.length,
            requestedItems,
          },
          "Sending upgrade search requests",
        );
        const command = await client.searchForUpgrade(itemIds);
        recordQualitySearch(instance.id, itemIds, "automation", command);
      });

      if (!sent) {
        log.info(
          {
            instanceId: instance.id,
            dueCount: dueRecords.length,
          },
          "Skipping upgrade search requests because another quality search is already running",
        );
      }
    }

    db.update(instancesTable)
      .set({ lastQualityCheckAt: nowIso })
      .where(eq(instancesTable.id, instance.id))
      .run();

    writeAuditLog({
      instanceId: instance.id,
      action: "quality_checks",
      source: "automation",
      details: {
        belowCutoffCount: records.length,
        dueCount: dueRecords.length,
        maxPerRun: instance.qualityCheckMaxItems,
        strategy: instance.qualityCheckStrategy,
      },
    });

    log.info(
      {
        instanceId: instance.id,
        belowCutoffCount: records.length,
        dueCount: dueRecords.length,
        maxPerRun: instance.qualityCheckMaxItems,
        strategy: instance.qualityCheckStrategy,
      },
      "Quality checks complete",
    );
  } catch (err) {
    log.error({ instanceId: instance.id, err }, "Quality checks failed");

    writeAuditLog({
      instanceId: instance.id,
      action: "quality_check_failed",
      source: "system",
      details: { error: err instanceof Error ? err.message : String(err) },
    });
  }
}
