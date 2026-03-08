import type { NextRequest } from "next/server";
import { withApiAuth } from "@/lib/auth/request";
import { getInstanceWithKey } from "@/lib/services/instance-service";
import { syncMediaCache } from "@/lib/scheduler/jobs/sync-media-cache";
import { isJobRunning, runExclusive } from "@/lib/scheduler/job-tracker";
import { success, error } from "@/lib/utils/api-response";
import { isArrInstanceType } from "@/lib/instances/definitions";

export const POST = withApiAuth(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    const { id } = await params;
    const instanceId = Number(id);
    const instance = getInstanceWithKey(instanceId);
    if (!instance) return error("Instance not found", 404);
    if (!isArrInstanceType(instance.type)) {
      return error("Media sync is only available for Sonarr and Radarr instances", 400);
    }

    if (isJobRunning(instanceId, "sync-media")) {
      return error("A media sync is already running for this instance", 409);
    }

    const ran = await runExclusive(instanceId, "sync-media", () => syncMediaCache(instance));
    if (!ran) {
      return error("A media sync is already running for this instance", 409);
    }

    return success({ synced: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to sync media cache";
    return error(message, 500);
  }
});
