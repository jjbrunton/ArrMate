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
import { isJobRunning, runExclusive } from "@/lib/scheduler/job-tracker";
import { success, error } from "@/lib/utils/api-response";
import { isArrInstanceType } from "@/lib/instances/definitions";
import { createLogger } from "@/lib/utils/logger";

const bodySchema = z.object({
  ids: z.array(z.number().int()).min(1).max(50),
});
const log = createLogger("quality-search");

function getActiveSearchMessage(instanceType: "radarr" | "sonarr") {
  return `${instanceType === "radarr" ? "Radarr" : "Sonarr"} is already processing search commands`;
}

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
    const instanceType = instance.type;

    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return error(parsed.error.issues.map((i) => i.message).join(", "), 400);
    }

    if (isJobRunning(instance.id, "quality-search")) {
      return error("A quality search is already running for this instance", 409);
    }

    let responseData:
      | {
          sent: false;
          searchedIds: number[];
          skippedIds: number[];
          command: null;
        }
      | {
          sent: true;
          searchedIds: number[];
          skippedIds: number[];
          command: Awaited<ReturnType<ArrClient["searchForUpgrade"]>>;
        }
      | null = null;
    let activeSearchCommands: Awaited<ReturnType<ArrClient["getActiveSearchCommands"]>> = [];

    const ran = await runExclusive(instance.id, "quality-search", async () => {
      const now = new Date();
      const { searchableIds, skippedIds } = partitionQualitySearchableItemIds(
        instance.id,
        instanceType,
        parsed.data.ids,
        now,
      );

      if (searchableIds.length === 0) {
        responseData = {
          sent: false,
          searchedIds: [],
          skippedIds,
          command: null,
        };
        return;
      }

      const apiKey = decrypt(instance.apiKey);
      const client = new ArrClient(instance.baseUrl, apiKey, instanceType);
      activeSearchCommands = await client.getActiveSearchCommands();
      if (activeSearchCommands.length > 0) {
        log.info(
          {
            instanceId: instance.id,
            source: "user",
            activeSearchCommands,
            skippedIds,
          },
          "Skipping upgrade search requests because Arr is already processing search commands",
        );
        responseData = {
          sent: false,
          searchedIds: [],
          skippedIds,
          command: null,
        };
        return;
      }

      const requestedItems = getQualitySearchLogItems(instance.id, instanceType, searchableIds);
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

      responseData = {
        sent: true,
        searchedIds: searchableIds,
        skippedIds,
        command: result,
      };
    });

    if (!ran) {
      return error("A quality search is already running for this instance", 409);
    }

    if (activeSearchCommands.length > 0) {
      return error(getActiveSearchMessage(instanceType), 409);
    }

    return success(responseData ?? {
      sent: false,
      searchedIds: [],
      skippedIds: [],
      command: null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to trigger upgrade search";
    return error(message, 500);
  }
});
