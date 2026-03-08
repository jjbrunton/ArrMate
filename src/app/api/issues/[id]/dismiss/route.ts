import type { NextRequest } from "next/server";
import { withApiAuth } from "@/lib/auth/request";
import { dismissIssue, getIssue } from "@/lib/services/issue-service";
import { success, error } from "@/lib/utils/api-response";

export const POST = withApiAuth(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    const { id } = await params;
    const issue = getIssue(Number(id));
    if (!issue) return error("Issue not found", 404);
    if (issue.status !== "active") return error("Issue is not active", 400);

    const dismissed = dismissIssue(Number(id));
    if (!dismissed) return error("Failed to dismiss issue", 500);

    return success({ dismissed: true });
  } catch {
    return error("Failed to dismiss issue");
  }
});
