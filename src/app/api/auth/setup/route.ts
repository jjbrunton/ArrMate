import type { NextRequest } from "next/server";
import { z } from "zod/v4";
import { getClientIpAddress, ensureSameOrigin } from "@/lib/auth/request";
import { setSessionCookie } from "@/lib/auth/session";
import { setupInitialAdmin } from "@/lib/services/auth-service";
import { scheduleNewInstance } from "@/lib/scheduler";
import { error, success } from "@/lib/utils/api-response";
import { INSTANCE_TYPE_VALUES } from "@/lib/instances/definitions";

const firstInstanceSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(INSTANCE_TYPE_VALUES),
  baseUrl: z.url(),
  apiKey: z.string().min(1),
}).optional();

const setupSchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(8).max(1000),
  firstInstance: firstInstanceSchema,
});

export async function POST(request: NextRequest) {
  const originError = ensureSameOrigin(request);

  if (originError) {
    return error(originError, 403);
  }

  try {
    const body = await request.json();
    const parsed = setupSchema.safeParse(body);

    if (!parsed.success) {
      return error(parsed.error.issues.map((issue) => issue.message).join(", "), 400);
    }

    const result = await setupInitialAdmin({
      ...parsed.data,
      ipAddress: getClientIpAddress(request),
      userAgent: request.headers.get("user-agent"),
    });

    if (!result.ok) {
      return error(result.message, result.reason === "already_configured" ? 409 : 503);
    }

    const response = success({
      authenticated: true,
      expiresAt: result.session.expiresAt,
      instanceCreated: result.instanceCreated,
    }, 201);

    if (result.createdInstanceId !== null) {
      void scheduleNewInstance(result.createdInstanceId);
    }

    setSessionCookie(response, result.sessionToken, result.expiresAt);
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to complete onboarding";
    const status = message.includes("connection") || message.includes("API") ? 422 : 500;
    return error(message, status);
  }
}
