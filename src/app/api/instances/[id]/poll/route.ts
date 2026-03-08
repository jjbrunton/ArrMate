import type { NextRequest } from "next/server";
import { withApiAuth } from "@/lib/auth/request";
import { getInstanceWithKey } from "@/lib/services/instance-service";
import { pollQueue } from "@/lib/scheduler/jobs/poll-queue";
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
      return error("Queue polling is only available for Sonarr and Radarr instances", 400);
    }

    if (isJobRunning(instanceId, "poll")) {
      return error("A queue poll is already running for this instance", 409);
    }

    const ran = await runExclusive(instanceId, "poll", () => pollQueue(instance));
    if (!ran) {
      return error("A queue poll is already running for this instance", 409);
    }

    return success({ polled: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to poll";
    return error(message, 500);
  }
});
