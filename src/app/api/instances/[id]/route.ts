import type { NextRequest } from "next/server";
import { z } from "zod/v4";
import { withApiAuth } from "@/lib/auth/request";
import { getInstance, updateInstance, deleteInstance, getInstanceStats } from "@/lib/services/instance-service";
import { getImportedRequestStats } from "@/lib/services/request-service";
import { success, error } from "@/lib/utils/api-response";
import { QUALITY_CHECK_STRATEGY_VALUES } from "@/lib/quality-check-strategy";

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  baseUrl: z.url().optional(),
  apiKey: z.string().min(1).optional(),
  pollIntervalSeconds: z.number().int().min(60).max(86400).optional(),
  qualityCheckIntervalSeconds: z.number().int().min(300).max(86400).optional(),
  qualityCheckMaxItems: z.number().int().min(1).max(500).optional(),
  qualityCheckStrategy: z.enum(QUALITY_CHECK_STRATEGY_VALUES).optional(),
  mediaSyncIntervalSeconds: z.number().int().min(300).max(86400).optional(),
  requestSyncIntervalSeconds: z.number().int().min(60).max(86400).nullable().optional(),
  enabled: z.boolean().optional(),
  autoFix: z.boolean().optional(),
});

export const GET = withApiAuth(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    const { id } = await params;
    const instance = getInstance(Number(id));
    if (!instance) return error("Instance not found", 404);

    const stats = getInstanceStats(Number(id));
    const requestStats = getImportedRequestStats(Number(id));
    return success({
      ...instance,
      ...stats,
      totalRequests: requestStats.totalRequests,
      pendingRequests: requestStats.pendingRequests,
      availableRequests: requestStats.availableRequests,
    });
  } catch {
    return error("Failed to get instance");
  }
}, { requireCsrf: false });

export const PUT = withApiAuth(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return error(parsed.error.issues.map((i) => i.message).join(", "), 400);
    }

    const instance = await updateInstance(Number(id), parsed.data);
    if (!instance) return error("Instance not found", 404);

    return success(instance);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update instance";
    return error(message, 500);
  }
});

export const DELETE = withApiAuth(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    const { id } = await params;
    const deleted = deleteInstance(Number(id));
    if (!deleted) return error("Instance not found", 404);
    return success({ deleted: true });
  } catch {
    return error("Failed to delete instance");
  }
});
