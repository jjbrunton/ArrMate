import type { NextRequest } from "next/server";
import { z } from "zod/v4";
import { withApiAuth } from "@/lib/auth/request";
import { verifyConnection } from "@/lib/services/instance-service";
import { success, error } from "@/lib/utils/api-response";
import { INSTANCE_TYPE_VALUES } from "@/lib/instances/definitions";

const verifySchema = z.object({
  type: z.enum(INSTANCE_TYPE_VALUES),
  baseUrl: z.url(),
  apiKey: z.string().min(1),
});

export const POST = withApiAuth(async (req: NextRequest) => {
  try {
    const body = await req.json();
    const parsed = verifySchema.safeParse(body);

    if (!parsed.success) {
      return error(parsed.error.issues.map((i) => i.message).join(", "), 400);
    }

    const status = await verifyConnection(parsed.data.type, parsed.data.baseUrl, parsed.data.apiKey);
    return success({ connected: true, appName: status.appName, version: status.version });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Connection failed";
    return error(message, 422);
  }
});
