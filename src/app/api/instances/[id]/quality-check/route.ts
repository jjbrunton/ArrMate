import type { NextRequest } from "next/server";
import { withApiAuth } from "@/lib/auth/request";
import { getInstanceWithKey } from "@/lib/services/instance-service";
import { runQualityChecks } from "@/lib/scheduler/jobs/quality-check";
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
      return error("Quality checks are only available for Sonarr and Radarr instances", 400);
    }

    if (isJobRunning(instanceId, "quality-check")) {
      return error("A quality check is already running for this instance", 409);
    }

    const ran = await runExclusive(instanceId, "quality-check", () => runQualityChecks(instance));
    if (!ran) {
      return error("A quality check is already running for this instance", 409);
    }

    return success({ checked: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to run quality checks";
    return error(message, 500);
  }
});
