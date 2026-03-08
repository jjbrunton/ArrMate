import { eq, and, count } from "drizzle-orm";
import { getDb } from "../db";
import {
  instances as instancesTable,
  cachedMovies,
  cachedSeries,
  cachedEpisodes,
} from "../db/schema";
import type { Movie, Series, Episode } from "../arr-client/types";

export function syncMovieCache(instanceId: number, movies: Movie[]) {
  const db = getDb();
  const now = new Date().toISOString();
  const previousByExternalId = new Map(
    db.select().from(cachedMovies).where(eq(cachedMovies.instanceId, instanceId)).all()
      .map((movie) => [movie.externalId, movie]),
  );

  db.transaction((tx) => {
    tx.delete(cachedMovies).where(eq(cachedMovies.instanceId, instanceId)).run();

    for (const movie of movies) {
      const previous = previousByExternalId.get(movie.id);
      tx.insert(cachedMovies)
        .values({
          instanceId,
          externalId: movie.id,
          title: movie.title,
          year: movie.year,
          tmdbId: movie.tmdbId,
          imdbId: movie.imdbId ?? null,
          status: movie.status ?? null,
          monitored: movie.monitored,
          hasFile: movie.hasFile,
          qualityProfileId: movie.qualityProfileId ?? null,
          sizeOnDisk: movie.sizeOnDisk ?? null,
          rootFolderPath: movie.rootFolderPath ?? null,
          path: movie.path ?? null,
          movieFileQuality: movie.movieFile?.quality
            ? JSON.stringify(movie.movieFile.quality)
            : (previous?.movieFileQuality ?? null),
          belowCutoff: previous?.belowCutoff ?? false,
          wantedQualityName: previous?.wantedQualityName ?? null,
          qualityLastSearchAt: previous?.qualityLastSearchAt ?? null,
          syncedAt: now,
        })
        .run();
    }

    tx.update(instancesTable)
      .set({ lastMediaSyncAt: now })
      .where(eq(instancesTable.id, instanceId))
      .run();
  });
}

export function syncSeriesCache(
  instanceId: number,
  seriesList: Series[],
  episodesBySeriesId: Map<number, Episode[]>,
) {
  const db = getDb();
  const now = new Date().toISOString();
  const previousEpisodesByExternalId = new Map(
    db.select().from(cachedEpisodes).where(eq(cachedEpisodes.instanceId, instanceId)).all()
      .map((episode) => [episode.externalId, episode]),
  );

  db.transaction((tx) => {
    // Cascade deletes episodes too
    tx.delete(cachedSeries).where(eq(cachedSeries.instanceId, instanceId)).run();

    for (const series of seriesList) {
      const inserted = tx
        .insert(cachedSeries)
        .values({
          instanceId,
          externalId: series.id,
          title: series.title,
          year: series.year,
          tvdbId: series.tvdbId,
          imdbId: series.imdbId ?? null,
          status: series.status,
          seriesType: series.seriesType,
          monitored: series.monitored,
          qualityProfileId: series.qualityProfileId,
          seasonCount: series.statistics?.seasonCount ?? series.seasonCount,
          path: series.path,
          rootFolderPath: series.rootFolderPath,
          totalEpisodeCount: series.statistics?.totalEpisodeCount ?? null,
          episodeFileCount: series.statistics?.episodeFileCount ?? null,
          episodeCount: series.statistics?.episodeCount ?? null,
          sizeOnDisk: series.statistics?.sizeOnDisk ?? null,
          percentOfEpisodes: series.statistics?.percentOfEpisodes ?? null,
          syncedAt: now,
        })
        .returning()
        .get();

      const episodes = episodesBySeriesId.get(series.id) ?? [];
      for (const ep of episodes) {
        const previous = previousEpisodesByExternalId.get(ep.id);
        tx.insert(cachedEpisodes)
          .values({
            instanceId,
            seriesCacheId: inserted.id,
            externalId: ep.id,
            seriesExternalId: ep.seriesId,
            seasonNumber: ep.seasonNumber,
            episodeNumber: ep.episodeNumber,
            title: ep.title ?? null,
            airDateUtc: ep.airDateUtc ?? null,
            monitored: ep.monitored,
            hasFile: ep.hasFile,
            episodeFileQuality: ep.episodeFile?.quality
              ? JSON.stringify(ep.episodeFile.quality)
              : (previous?.episodeFileQuality ?? null),
            episodeFileSize: ep.episodeFile?.size ?? null,
            belowCutoff: previous?.belowCutoff ?? false,
            wantedQualityName: previous?.wantedQualityName ?? null,
            qualityLastSearchAt: previous?.qualityLastSearchAt ?? null,
            syncedAt: now,
          })
          .run();
      }
    }

    tx.update(instancesTable)
      .set({ lastMediaSyncAt: now })
      .where(eq(instancesTable.id, instanceId))
      .run();
  });
}

export function getCachedMovies(instanceId: number) {
  const db = getDb();
  return db
    .select()
    .from(cachedMovies)
    .where(eq(cachedMovies.instanceId, instanceId))
    .all();
}

export function getCachedSeries(instanceId: number) {
  const db = getDb();
  return db
    .select()
    .from(cachedSeries)
    .where(eq(cachedSeries.instanceId, instanceId))
    .all();
}

export function getCachedEpisodes(instanceId: number, seriesExternalId?: number) {
  const db = getDb();
  const conditions = seriesExternalId !== undefined
    ? and(eq(cachedEpisodes.instanceId, instanceId), eq(cachedEpisodes.seriesExternalId, seriesExternalId))
    : eq(cachedEpisodes.instanceId, instanceId);

  return db.select().from(cachedEpisodes).where(conditions).all();
}

export function invalidateMediaCache(instanceId: number) {
  const db = getDb();
  db.transaction((tx) => {
    tx.delete(cachedMovies).where(eq(cachedMovies.instanceId, instanceId)).run();
    tx.delete(cachedSeries).where(eq(cachedSeries.instanceId, instanceId)).run();
    tx.update(instancesTable)
      .set({ lastMediaSyncAt: null })
      .where(eq(instancesTable.id, instanceId))
      .run();
  });
}

export function getMediaCacheStats(instanceId: number) {
  const db = getDb();
  const instance = db
    .select({ lastMediaSyncAt: instancesTable.lastMediaSyncAt })
    .from(instancesTable)
    .where(eq(instancesTable.id, instanceId))
    .get();

  const movieCount = db.select({ value: count() }).from(cachedMovies)
    .where(eq(cachedMovies.instanceId, instanceId)).get()!.value;
  const seriesCount = db.select({ value: count() }).from(cachedSeries)
    .where(eq(cachedSeries.instanceId, instanceId)).get()!.value;
  const episodeCount = db.select({ value: count() }).from(cachedEpisodes)
    .where(eq(cachedEpisodes.instanceId, instanceId)).get()!.value;

  return {
    movieCount,
    seriesCount,
    episodeCount,
    lastSyncedAt: instance?.lastMediaSyncAt ?? null,
  };
}

export function getAllMediaItemCounts(): {
  instanceId: number;
  movieCount: number;
  episodeCount: number;
}[] {
  const db = getDb();

  const movieCounts = db
    .select({ instanceId: cachedMovies.instanceId, value: count() })
    .from(cachedMovies)
    .groupBy(cachedMovies.instanceId)
    .all();

  const episodeCounts = db
    .select({ instanceId: cachedEpisodes.instanceId, value: count() })
    .from(cachedEpisodes)
    .groupBy(cachedEpisodes.instanceId)
    .all();

  const merged = new Map<number, { movieCount: number; episodeCount: number }>();
  for (const { instanceId, value } of movieCounts) {
    merged.set(instanceId, { movieCount: value, episodeCount: 0 });
  }
  for (const { instanceId, value } of episodeCounts) {
    const existing = merged.get(instanceId) ?? { movieCount: 0, episodeCount: 0 };
    existing.episodeCount = value;
    merged.set(instanceId, existing);
  }

  return Array.from(merged.entries()).map(([instanceId, counts]) => ({
    instanceId,
    movieCount: counts.movieCount,
    episodeCount: counts.episodeCount,
  }));
}
