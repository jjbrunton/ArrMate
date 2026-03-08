import type { NextRequest } from "next/server";
import { z } from "zod/v4";
import { withApiAuth } from "@/lib/auth/request";
import { getInstanceWithKey } from "@/lib/services/instance-service";
import { ArrClient } from "@/lib/arr-client/client";
import { decrypt } from "@/lib/crypto";
import {
  getQualitySearchLogItems,
  partitionQualitySearchableItemIds,
  recordQualitySearch,
} from "@/lib/services/quality-service";
import { success, error } from "@/lib/utils/api-response";
import { isArrInstanceType } from "@/lib/instances/definitions";
import { createLogger } from "@/lib/utils/logger";

const bodySchema = z.object({
  ids: z.array(z.number().int()).min(1).max(50),
});
const log = createLogger("quality-search");

export const POST = withApiAuth(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    const { id } = await params;
    const instance = getInstanceWithKey(Number(id));
    if (!instance) return error("Instance not found", 404);
    if (!isArrInstanceType(instance.type)) {
      return error("Quality searches are only available for Sonarr and Radarr instances", 400);
    }

    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return error(parsed.error.issues.map((i) => i.message).join(", "), 400);
    }

    const now = new Date();
    const { searchableIds, skippedIds } = partitionQualitySearchableItemIds(
      instance.id,
      instance.type,
      parsed.data.ids,
      now,
    );

    if (searchableIds.length === 0) {
      return success({
        sent: false,
        searchedIds: [],
        skippedIds,
        command: null,
      });
    }

    const apiKey = decrypt(instance.apiKey);
    const client = new ArrClient(instance.baseUrl, apiKey, instance.type);
    const requestedItems = getQualitySearchLogItems(instance.id, instance.type, searchableIds);
    log.info(
      {
        instanceId: instance.id,
        source: "user",
        requestedCount: requestedItems.length,
        requestedItems,
        skippedIds,
      },
      "Sending upgrade search requests",
    );
    const result = await client.searchForUpgrade(searchableIds);
    recordQualitySearch(instance.id, searchableIds, "user", result);

    return success({
      sent: true,
      searchedIds: searchableIds,
      skippedIds,
      command: result,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to trigger upgrade search";
    return error(message, 500);
  }
});
