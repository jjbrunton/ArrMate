import type { NextRequest } from "next/server";
import { z } from "zod/v4";
import { withApiAuth } from "@/lib/auth/request";
import { dismissAllIssues } from "@/lib/services/issue-service";
import { success, error } from "@/lib/utils/api-response";

const schema = z.object({
  instanceId: z.number().int(),
});

export const POST = withApiAuth(async (req: NextRequest) => {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return error(parsed.error.issues.map((i) => i.message).join(", "), 400);
    }

    const count = dismissAllIssues(parsed.data.instanceId);
    return success({ dismissed: count });
  } catch {
    return error("Failed to dismiss issues");
  }
});
