import type { NextRequest } from "next/server";
import { withApiAuth } from "@/lib/auth/request";
import { getInstanceWithKey } from "@/lib/services/instance-service";
import { syncOverseerrRequests } from "@/lib/services/request-service";
import { isJobRunning, runExclusive } from "@/lib/scheduler/job-tracker";
import { error, success } from "@/lib/utils/api-response";
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
    if (isArrInstanceType(instance.type)) {
      return error("Request sync is only available for Overseerr instances", 400);
    }

    if (isJobRunning(instanceId, "sync-requests")) {
      return error("A request sync is already running for this instance", 409);
    }

    let importedCount = 0;
    const ran = await runExclusive(instanceId, "sync-requests", async () => {
      const requests = await syncOverseerrRequests(instance);
      importedCount = requests.length;
    });

    if (!ran) {
      return error("A request sync is already running for this instance", 409);
    }

    return success({ importedCount });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to sync requests";
    return error(message, 500);
  }
});

