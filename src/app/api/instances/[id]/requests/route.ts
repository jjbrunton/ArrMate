import type { NextRequest } from "next/server";
import { withApiAuth } from "@/lib/auth/request";
import { listImportedRequests } from "@/lib/services/request-service";
import { getInstanceWithKey } from "@/lib/services/instance-service";
import { error, success } from "@/lib/utils/api-response";
import { isArrInstanceType } from "@/lib/instances/definitions";

export const GET = withApiAuth(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    const { id } = await params;
    const instance = getInstanceWithKey(Number(id));
    if (!instance) return error("Instance not found", 404);
    if (isArrInstanceType(instance.type)) {
      return error("Requests are only available for Overseerr instances", 400);
    }

    return success(listImportedRequests(instance.id));
  } catch {
    return error("Failed to fetch imported requests");
  }
}, { requireCsrf: false });

