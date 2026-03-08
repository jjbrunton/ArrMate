import type { NextRequest } from "next/server";
import { z } from "zod/v4";
import { authenticateAdmin } from "@/lib/services/auth-service";
import { getClientIpAddress, ensureSameOrigin } from "@/lib/auth/request";
import { setSessionCookie } from "@/lib/auth/session";
import { success, error } from "@/lib/utils/api-response";

const loginSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(1000),
});

export async function POST(request: NextRequest) {
  const originError = ensureSameOrigin(request);

  if (originError) {
    return error(originError, 403);
  }

  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return error(parsed.error.issues.map((issue) => issue.message).join(", "), 400);
    }

    const result = authenticateAdmin({
      ...parsed.data,
      ipAddress: getClientIpAddress(request),
      userAgent: request.headers.get("user-agent"),
    });

    if (!result.ok) {
      const status =
        result.reason === "rate_limited"
          ? 429
          : result.reason === "not_configured"
            ? 503
            : 401;

      return error(result.message, status, result.retryAfterSeconds
        ? { "Retry-After": String(result.retryAfterSeconds) }
        : undefined);
    }

    const response = success({
      authenticated: true,
      expiresAt: result.session.expiresAt,
    });

    setSessionCookie(response, result.sessionToken, result.expiresAt);
    return response;
  } catch {
    return error("Failed to sign in");
  }
}
