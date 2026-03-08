import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { instances } from "../../db/schema";
import { decrypt } from "../../crypto";
import { writeAuditLog } from "../../services/issue-service";
import { createLogger } from "../../utils/logger";
import { verifyInstanceConnection } from "../../instances/connection";

const log = createLogger("health-check");

export async function checkInstanceHealth(instanceId: number) {
  const db = getDb();
  const instance = db.select().from(instances).where(eq(instances.id, instanceId)).get();
  if (!instance) return;

  const now = new Date().toISOString();

  try {
    const apiKey = decrypt(instance.apiKey);
    await verifyInstanceConnection(instance.type, instance.baseUrl, apiKey);

    const previousStatus = instance.lastHealthStatus;
    db.update(instances)
      .set({ lastHealthCheck: now, lastHealthStatus: "healthy" })
      .where(eq(instances.id, instanceId))
      .run();

    log.info({ instanceId, name: instance.name }, "Health check passed");

    if (previousStatus !== "healthy") {
      writeAuditLog({
        instanceId,
        action: "health_restored",
        source: "system",
        details: { previousStatus },
      });
    }
  } catch (err) {
    const previousStatus = instance.lastHealthStatus;
    db.update(instances)
      .set({ lastHealthCheck: now, lastHealthStatus: "unhealthy" })
      .where(eq(instances.id, instanceId))
      .run();

    log.warn({ instanceId, name: instance.name, err }, "Health check failed");

    if (previousStatus !== "unhealthy") {
      writeAuditLog({
        instanceId,
        action: "health_degraded",
        source: "system",
        details: { error: err instanceof Error ? err.message : String(err) },
      });
    }
  }
}
