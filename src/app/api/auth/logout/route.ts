import type { NextRequest } from "next/server";
import { ensureSameOrigin } from "@/lib/auth/request";
import { clearSessionCookie, getSessionTokenFromRequest } from "@/lib/auth/session";
import { revokeAuthenticatedSession } from "@/lib/services/auth-service";
import { success, error } from "@/lib/utils/api-response";

export async function POST(request: NextRequest) {
  const originError = ensureSameOrigin(request);

  if (originError) {
    return error(originError, 403);
  }

  revokeAuthenticatedSession(getSessionTokenFromRequest(request));

  const response = success({ loggedOut: true });
  clearSessionCookie(response);
  return response;
}
