import { ArrClient } from "../arr-client/client";
import { getInstanceDefinition, isArrInstanceType, type InstanceType } from "./definitions";
import { OverseerrClient } from "../overseerr-client/client";

export interface VerifiedInstanceConnection {
  appName: string;
  version: string;
}

export async function verifyInstanceConnection(
  type: InstanceType,
  baseUrl: string,
  apiKey: string,
): Promise<VerifiedInstanceConnection> {
  if (isArrInstanceType(type)) {
    const status = await new ArrClient(baseUrl, apiKey, type).testConnection();

    return {
      appName: status.appName,
      version: status.version,
    };
  }

  const status = await new OverseerrClient(baseUrl, apiKey).testConnection();

  return {
    appName: status.appName ?? getInstanceDefinition(type).label,
    version: status.version,
  };
}

