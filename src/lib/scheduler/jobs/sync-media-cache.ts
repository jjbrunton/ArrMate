import { eq } from "drizzle-orm";
import { ArrClient } from "../../arr-client/client";
import { decrypt } from "../../crypto";
import { getDb } from "../../db";
import { instances as instancesTable } from "../../db/schema";
import { syncMovieCache, syncSeriesCache } from "../../services/media-cache-service";
import { writeAuditLog } from "../../services/issue-service";
import type { Instance } from "../../db/schema";
import type { Episode } from "../../arr-client/types";
import { createLogger } from "../../utils/logger";

const log = createLogger("sync-media-cache");
const CONCURRENCY = 3;

export async function syncMediaCache(instance: Instance) {
  log.info({ instanceId: instance.id, name: instance.name }, "Syncing media cache");

  try {
    // Re-read instance from DB for freshness
    const freshInstance = getDb()
      .select()
      .from(instancesTable)
      .where(eq(instancesTable.id, instance.id))
      .get();
    if (freshInstance) {
      instance = freshInstance;
    }
    if (!instance.enabled) return;

    const apiKey = decrypt(instance.apiKey);
    const client = new ArrClient(instance.baseUrl, apiKey, instance.type as "sonarr" | "radarr");

    if (instance.type === "radarr") {
      await syncRadarrCache(instance, client);
    } else {
      await syncSonarrCache(instance, client);
    }

    log.info({ instanceId: instance.id }, "Media cache sync complete");
  } catch (err) {
    log.error({ instanceId: instance.id, err }, "Media cache sync failed");

    writeAuditLog({
      instanceId: instance.id,
      action: "media_sync_failed",
      source: "system",
      details: { error: err instanceof Error ? err.message : String(err) },
    });
  }
}

async function syncRadarrCache(instance: Instance, client: ArrClient) {
  const movies = await client.getMovies();

  if (movies.length === 0) {
    log.warn({ instanceId: instance.id }, "Radarr returned empty movie list — skipping cache sync to preserve existing data");
    return;
  }

  syncMovieCache(instance.id, movies);

  writeAuditLog({
    instanceId: instance.id,
    action: "media_sync",
    source: "system",
    details: { type: "radarr", movieCount: movies.length },
  });

  log.info({ instanceId: instance.id, movieCount: movies.length }, "Radarr cache synced");
}

async function syncSonarrCache(instance: Instance, client: ArrClient) {
  const seriesList = await client.getSeries();

  if (seriesList.length === 0) {
    log.warn({ instanceId: instance.id }, "Sonarr returned empty series list — skipping cache sync to preserve existing data");
    return;
  }

  // Fetch episodes for each series with concurrency control
  const episodesBySeriesId = new Map<number, Episode[]>();
  const seriesQueue = [...seriesList];
  let failedCount = 0;

  async function processNext(): Promise<void> {
    while (seriesQueue.length > 0) {
      const series = seriesQueue.shift()!;
      try {
        const episodes = await client.getEpisodes(series.id);
        episodesBySeriesId.set(series.id, episodes);
      } catch (err) {
        failedCount++;
        log.warn(
          { instanceId: instance.id, seriesId: series.id, err },
          "Failed to fetch episodes for series",
        );
        episodesBySeriesId.set(series.id, []);
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, seriesList.length) }, () =>
    processNext(),
  );
  await Promise.allSettled(workers);

  syncSeriesCache(instance.id, seriesList, episodesBySeriesId);

  const totalEpisodes = Array.from(episodesBySeriesId.values()).reduce(
    (sum, eps) => sum + eps.length,
    0,
  );

  writeAuditLog({
    instanceId: instance.id,
    action: "media_sync",
    source: "system",
    details: {
      type: "sonarr",
      seriesCount: seriesList.length,
      episodeCount: totalEpisodes,
      failedSeriesFetches: failedCount,
    },
  });

  log.info(
    { instanceId: instance.id, seriesCount: seriesList.length, episodeCount: totalEpisodes },
    "Sonarr cache synced",
  );
}
