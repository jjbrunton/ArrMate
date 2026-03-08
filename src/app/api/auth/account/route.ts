import type { NextRequest } from "next/server";
import { z } from "zod/v4";
import { withApiAuth } from "@/lib/auth/request";
import { getSessionTokenFromRequest } from "@/lib/auth/session";
import { changeAdminPassword, getAdminAccount } from "@/lib/services/auth-service";
import { error, success } from "@/lib/utils/api-response";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(1000),
  newPassword: z.string().min(8).max(1000),
});

export const GET = withApiAuth(async () => {
  const account = getAdminAccount();

  if (!account) {
    return error("Administrator account is not configured", 404);
  }

  return success(account);
});

export const POST = withApiAuth(async (request: NextRequest) => {
  try {
    const body = await request.json();
    const parsed = changePasswordSchema.safeParse(body);

    if (!parsed.success) {
      return error(parsed.error.issues.map((issue) => issue.message).join(", "), 400);
    }

    const result = changeAdminPassword({
      ...parsed.data,
      sessionToken: getSessionTokenFromRequest(request),
    });

    if (!result.ok) {
      return error(result.message, result.reason === "not_configured" ? 503 : 401);
    }

    return success({
      updated: true,
      username: result.username,
    });
  } catch {
    return error("Failed to change password");
  }
}, { requireCsrf: true });
