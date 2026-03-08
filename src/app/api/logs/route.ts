import type { NextRequest } from "next/server";
import { withApiAuth } from "@/lib/auth/request";
import { getRecentAuditLog } from "@/lib/services/issue-service";
import { success } from "@/lib/utils/api-response";

export const GET = withApiAuth(async (request: NextRequest) => {
  const { searchParams } = request.nextUrl;
  const limit = Math.min(Number(searchParams.get("limit") || 100), 500);
  const afterId = searchParams.get("afterId")
    ? Number(searchParams.get("afterId"))
    : undefined;

  const entries = getRecentAuditLog(limit, afterId);
  return success(entries);
}, { requireCsrf: false });
