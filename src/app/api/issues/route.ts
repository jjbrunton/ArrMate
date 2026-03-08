import type { NextRequest } from "next/server";
import { withApiAuth } from "@/lib/auth/request";
import { getActiveIssues, getAllIssues } from "@/lib/services/issue-service";
import { success, error } from "@/lib/utils/api-response";

export const GET = withApiAuth(async (req: NextRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const instanceId = searchParams.get("instanceId");
    const showAll = searchParams.get("all") === "true";

    const id = instanceId ? Number(instanceId) : undefined;
    const issues = showAll ? getAllIssues(id) : getActiveIssues(id);

    return success(issues);
  } catch {
    return error("Failed to list issues");
  }
}, { requireCsrf: false });
