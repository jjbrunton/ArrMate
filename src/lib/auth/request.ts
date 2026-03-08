import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { error } from "@/lib/utils/api-response";
import { clearSessionCookie, getSessionCookieName, getSessionTokenFromRequest } from "./session";
import { getAuthenticatedSession, getAuthConfigurationStatus } from "../services/auth-service";

function buildUnauthorizedResponse() {
  const response = error("Unauthorized", 401);
  clearSessionCookie(response);
  return response;
}

export function getClientIpAddress(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
}

export function ensureSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (!origin) {
    return "Missing Origin header";
  }

  const host = request.headers.get("host");

  try {
    const originHost = new URL(origin).host;
    if (originHost === host) {
      return null;
    }
  } catch {
    // invalid origin URL
  }

  return "Invalid request origin";
}

export async function getPageSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(getSessionCookieName())?.value;
  return getAuthenticatedSession(token);
}

export async function requirePageSession() {
  const session = await getPageSession();

  if (!session) {
    const authStatus = getAuthConfigurationStatus();
    redirect(authStatus.configured ? "/login" : "/onboarding");
  }

  return session;
}

export async function requireApiSession(request: NextRequest, requireCsrf = false) {
  const authStatus = getAuthConfigurationStatus();

  if (!authStatus.configured) {
    return {
      response: error(authStatus.message ?? "Onboarding required", authStatus.canSetInitialAdmin ? 409 : 503),
    };
  }

  if (requireCsrf) {
    const originError = ensureSameOrigin(request);
    if (originError) {
      return { response: error(originError, 403) };
    }
  }

  const session = getAuthenticatedSession(getSessionTokenFromRequest(request));

  if (!session) {
    return { response: buildUnauthorizedResponse() };
  }

  return { session };
}

type RouteContext = {
  params: Promise<Record<string, string | string[] | undefined>>;
};

export function withApiAuth<Context = RouteContext>(
  handler: (request: NextRequest, context: Context, session: NonNullable<Awaited<ReturnType<typeof getPageSession>>>) => Response | Promise<Response>,
  options: {
    requireCsrf?: boolean;
  } = {},
) {
  return async (request: NextRequest, context: Context) => {
    const auth = await requireApiSession(request, options.requireCsrf ?? !["GET", "HEAD", "OPTIONS"].includes(request.method));

    if ("response" in auth) {
      return auth.response;
    }

    return handler(request, context, auth.session);
  };
}
