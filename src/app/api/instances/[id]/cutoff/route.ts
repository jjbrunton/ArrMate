import type { NextRequest } from "next/server";
import { z } from "zod/v4";
import { withApiAuth } from "@/lib/auth/request";
import { getInstanceWithKey } from "@/lib/services/instance-service";
import { getQualityPage } from "@/lib/services/quality-service";
import { success, error } from "@/lib/utils/api-response";
import { isArrInstanceType } from "@/lib/instances/definitions";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const GET = withApiAuth(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    const { id } = await params;
    const instance = getInstanceWithKey(Number(id));
    if (!instance) return error("Instance not found", 404);
    if (!isArrInstanceType(instance.type)) {
      return error("Quality data is only available for Sonarr and Radarr instances", 400);
    }

    const searchParams = Object.fromEntries(req.nextUrl.searchParams);
    const parsed = querySchema.safeParse(searchParams);
    if (!parsed.success) {
      return error(parsed.error.issues.map((i) => i.message).join(", "), 400);
    }

    const data = getQualityPage(
      instance.id,
      instance.type,
      parsed.data.page,
      parsed.data.pageSize,
    );

    return success(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch cutoff unmet items";
    return error(message, 500);
  }
}, { requireCsrf: false });
