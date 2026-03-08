import type { NextRequest } from "next/server";
import { z } from "zod/v4";
import { withApiAuth } from "@/lib/auth/request";
import { getIssue, getFix } from "@/lib/services/issue-service";
import { getInstanceWithKey } from "@/lib/services/instance-service";
import { ArrClient } from "@/lib/arr-client/client";
import { decrypt } from "@/lib/crypto";
import { success, error } from "@/lib/utils/api-response";
import { executeAndRecordFix } from "@/lib/issues/fix-executor";

const fixSchema = z.object({
  fixId: z.number().int(),
});

export const POST = withApiAuth(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = fixSchema.safeParse(body);

    if (!parsed.success) {
      return error(parsed.error.issues.map((i) => i.message).join(", "), 400);
    }

    const issue = getIssue(Number(id));
    if (!issue) return error("Issue not found", 404);
    if (issue.status !== "active") return error("Issue is not active", 400);

    const fix = getFix(parsed.data.fixId);
    if (!fix) return error("Fix not found", 404);
    if (fix.issueId !== issue.id) return error("Fix does not belong to this issue", 400);

    const instance = getInstanceWithKey(issue.instanceId);
    if (!instance) return error("Instance not found", 404);

    if (!issue.externalQueueId) return error("No external queue ID for this issue", 400);

    const apiKey = decrypt(instance.apiKey);
    const client = new ArrClient(instance.baseUrl, apiKey, instance.type as "sonarr" | "radarr");

    const result = await executeAndRecordFix(client, instance, issue, fix, "user");

    return success(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to execute fix";
    return error(message, 500);
  }
});
