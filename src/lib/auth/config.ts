import { getOrCreatePersistentHexSecret } from "../config/persistent-secret";

export interface AuthEnvironmentStatus {
  ready: boolean;
  message?: string;
}

function getSessionSecret(): Buffer {
  const raw = process.env.AUTH_SESSION_SECRET?.trim() || getOrCreatePersistentHexSecret("auth-session-secret.hex");

  const secret = Buffer.from(raw, "hex");

  if (secret.length !== 32) {
    throw new Error("AUTH_SESSION_SECRET must be 64 hex characters (32 bytes)");
  }

  return secret;
}

export function getAuthEnvironmentStatus(): AuthEnvironmentStatus {
  try {
    getSessionSecret();
    return { ready: true };
  } catch (err) {
    return {
      ready: false,
      message: err instanceof Error ? err.message : "Authentication is not configured",
    };
  }
}

export function getAuthSessionSecret(): Buffer {
  return getSessionSecret();
}
