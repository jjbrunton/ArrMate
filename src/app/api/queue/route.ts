import type { NextRequest } from "next/server";
import { withApiAuth } from "@/lib/auth/request";
import { getQueueItems } from "@/lib/services/queue-service";
import { success, error } from "@/lib/utils/api-response";

export const GET = withApiAuth(async (req: NextRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const instanceId = searchParams.get("instanceId");
    if (!instanceId) return error("instanceId is required", 400);

    const includeGone = searchParams.get("includeGone") === "true";
    const items = getQueueItems(Number(instanceId), includeGone);

    return success(items);
  } catch {
    return error("Failed to get queue items");
  }
}, { requireCsrf: false });
