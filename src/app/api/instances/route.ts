import type { NextRequest } from "next/server";
import { z } from "zod/v4";
import { withApiAuth } from "@/lib/auth/request";
import { listInstances, createInstance } from "@/lib/services/instance-service";
import { getAllQueueItemCounts } from "@/lib/services/queue-service";
import { getActiveIssueCounts } from "@/lib/services/issue-service";
import { getAllMediaItemCounts } from "@/lib/services/media-cache-service";
import { getAllImportedRequestStats } from "@/lib/services/request-service";
import { scheduleNewInstance } from "@/lib/scheduler";
import { getRunningJobs } from "@/lib/scheduler/job-tracker";
import { success, error } from "@/lib/utils/api-response";
import { INSTANCE_TYPE_VALUES, getInstanceDefinition } from "@/lib/instances/definitions";
import { QUALITY_CHECK_STRATEGY_VALUES } from "@/lib/quality-check-strategy";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(INSTANCE_TYPE_VALUES),
  baseUrl: z.url(),
  apiKey: z.string().min(1),
  pollIntervalSeconds: z.number().int().min(60).max(86400).optional(),
  qualityCheckIntervalSeconds: z.number().int().min(300).max(86400).optional(),
  qualityCheckMaxItems: z.number().int().min(1).max(500).optional(),
  qualityCheckStrategy: z.enum(QUALITY_CHECK_STRATEGY_VALUES).optional(),
  mediaSyncIntervalSeconds: z.number().int().min(300).max(86400).optional(),
  requestSyncIntervalSeconds: z.number().int().min(60).max(86400).optional(),
  autoFix: z.boolean().optional(),
});

export const GET = withApiAuth(async () => {
  try {
    const all = listInstances();
    const queueCounts = getAllQueueItemCounts();
    const issueCounts = getActiveIssueCounts();
    const mediaCounts = getAllMediaItemCounts();
    const requestCounts = getAllImportedRequestStats();

    const queueMap = new Map(queueCounts.map((c) => [c.instanceId, c.count]));
    const issueMap = new Map(issueCounts.map((c) => [c.instanceId, c.count]));
    const mediaMap = new Map(mediaCounts.map((c) => [c.instanceId, c]));
    const requestMap = new Map(requestCounts.map((c) => [c.instanceId, c]));

    const enriched = all.map((inst) => {
      const definition = getInstanceDefinition(inst.type);
      const runningJobs = getRunningJobs(inst.id);
      const requestStats = requestMap.get(inst.id);

      return {
        ...inst,
        queueCount: queueMap.get(inst.id) ?? 0,
        activeIssues: issueMap.get(inst.id) ?? 0,
        mediaCount: definition.supportsMediaSync && inst.lastMediaSyncAt
          ? (inst.type === "sonarr"
              ? (mediaMap.get(inst.id)?.episodeCount ?? 0)
              : (mediaMap.get(inst.id)?.movieCount ?? 0))
          : null,
        requestCount: requestStats?.totalRequests ?? 0,
        pendingRequestCount: requestStats?.pendingRequests ?? 0,
        availableRequestCount: requestStats?.availableRequests ?? 0,
        runningJobs,
        busy: runningJobs.length > 0,
      };
    });

    return success(enriched);
  } catch {
    return error("Failed to list instances");
  }
}, { requireCsrf: false });

export const POST = withApiAuth(async (req: NextRequest) => {
  try {
    const body = await req.json();
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return error(parsed.error.issues.map((i) => i.message).join(", "), 400);
    }

    const instance = await createInstance(parsed.data);
    void scheduleNewInstance(instance.id);
    return success(instance, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create instance";
    const status = message.includes("connection") || message.includes("API") ? 422 : 500;
    return error(message, status);
  }
});
