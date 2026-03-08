import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { and, eq } from "drizzle-orm";
import * as schema from "../db/schema";

let testDb: ReturnType<typeof drizzle>;
let sqlite: InstanceType<typeof Database>;

const CREATE_SQL = `
  CREATE TABLE IF NOT EXISTS instances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_key TEXT NOT NULL,
    poll_interval_seconds INTEGER NOT NULL DEFAULT 300,
    quality_check_max_items INTEGER NOT NULL DEFAULT 50,
    enabled INTEGER NOT NULL DEFAULT 1,
    auto_fix INTEGER NOT NULL DEFAULT 0,
    last_health_check TEXT,
    last_health_status TEXT DEFAULT 'unknown',
    last_polled_at TEXT,
    last_quality_check_at TEXT,
    media_sync_interval_seconds INTEGER NOT NULL DEFAULT 3600,
    last_media_sync_at TEXT,
    request_sync_interval_seconds INTEGER,
    last_request_sync_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS cached_movies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instance_id INTEGER NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    external_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    year INTEGER,
    tmdb_id INTEGER,
    imdb_id TEXT,
    status TEXT,
    monitored INTEGER NOT NULL DEFAULT 1,
    has_file INTEGER NOT NULL DEFAULT 0,
    quality_profile_id INTEGER,
    size_on_disk INTEGER,
    root_folder_path TEXT,
    path TEXT,
    movie_file_quality TEXT,
    below_cutoff INTEGER NOT NULL DEFAULT 0,
    wanted_quality_name TEXT,
    quality_last_search_at TEXT,
    synced_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS cached_series (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instance_id INTEGER NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    external_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    year INTEGER,
    tvdb_id INTEGER,
    imdb_id TEXT,
    status TEXT,
    series_type TEXT,
    monitored INTEGER NOT NULL DEFAULT 1,
    quality_profile_id INTEGER,
    season_count INTEGER,
    path TEXT,
    root_folder_path TEXT,
    total_episode_count INTEGER,
    episode_file_count INTEGER,
    episode_count INTEGER,
    size_on_disk INTEGER,
    percent_of_episodes INTEGER,
    synced_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS cached_episodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instance_id INTEGER NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    series_cache_id INTEGER NOT NULL REFERENCES cached_series(id) ON DELETE CASCADE,
    external_id INTEGER NOT NULL,
    series_external_id INTEGER NOT NULL,
    season_number INTEGER NOT NULL,
    episode_number INTEGER NOT NULL,
    title TEXT,
    air_date_utc TEXT,
    monitored INTEGER NOT NULL DEFAULT 1,
    has_file INTEGER NOT NULL DEFAULT 0,
    episode_file_quality TEXT,
    episode_file_size INTEGER,
    below_cutoff INTEGER NOT NULL DEFAULT 0,
    wanted_quality_name TEXT,
    quality_last_search_at TEXT,
    synced_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

vi.mock("../db", () => ({
  getDb: () => testDb,
}));

function setupDb() {
  sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  testDb = drizzle(sqlite, { schema });
  sqlite.exec(CREATE_SQL);
}

describe("media-cache-service", () => {
  beforeEach(() => {
    setupDb();
  });

  it("preserves movie quality snapshot fields across a cache rebuild", async () => {
    const { syncMovieCache } = await import("./media-cache-service");

    const instance = testDb.insert(schema.instances).values({
      name: "Radarr",
      type: "radarr",
      baseUrl: "http://localhost:7878",
      apiKey: "secret",
    }).returning().get()!;

    testDb.insert(schema.cachedMovies).values({
      instanceId: instance.id,
      externalId: 101,
      title: "Existing Movie",
      monitored: true,
      hasFile: true,
      belowCutoff: true,
      wantedQualityName: "265 - Max 2160p",
      qualityLastSearchAt: "2026-03-08T19:30:28.000Z",
      movieFileQuality: '{"quality":{"id":3,"name":"WEBDL-1080p","source":"webdl","resolution":1080},"revision":{"version":1,"real":0,"isRepack":false}}',
    }).run();

    syncMovieCache(instance.id, [{
      id: 101,
      title: "Existing Movie",
      year: 2024,
      tmdbId: 1,
      monitored: true,
      hasFile: true,
      status: "released",
      path: "/movies/existing-movie",
      rootFolderPath: "/movies",
      sizeOnDisk: 100,
      qualityProfileId: 7,
    }]);

    const refreshed = testDb.select().from(schema.cachedMovies)
      .where(and(eq(schema.cachedMovies.instanceId, instance.id), eq(schema.cachedMovies.externalId, 101)))
      .get();

    expect(refreshed).toMatchObject({
      belowCutoff: true,
      wantedQualityName: "265 - Max 2160p",
      qualityLastSearchAt: "2026-03-08T19:30:28.000Z",
    });
  });

  it("preserves episode quality snapshot fields across a series cache rebuild", async () => {
    const { syncSeriesCache } = await import("./media-cache-service");

    const instance = testDb.insert(schema.instances).values({
      name: "Sonarr",
      type: "sonarr",
      baseUrl: "http://localhost:8989",
      apiKey: "secret",
    }).returning().get()!;

    const existingSeries = testDb.insert(schema.cachedSeries).values({
      instanceId: instance.id,
      externalId: 200,
      title: "Tracked Series",
      monitored: true,
      qualityProfileId: 9,
    }).returning().get()!;

    testDb.insert(schema.cachedEpisodes).values({
      instanceId: instance.id,
      seriesCacheId: existingSeries.id,
      externalId: 201,
      seriesExternalId: 200,
      seasonNumber: 1,
      episodeNumber: 2,
      title: "Episode Two",
      monitored: true,
      hasFile: true,
      belowCutoff: true,
      wantedQualityName: "Bluray-2160p",
      qualityLastSearchAt: "2026-03-08T19:30:28.000Z",
      episodeFileQuality: '{"quality":{"id":3,"name":"WEBDL-1080p","source":"webdl","resolution":1080},"revision":{"version":1,"real":0,"isRepack":false}}',
    }).run();

    syncSeriesCache(instance.id, [{
      id: 200,
      title: "Tracked Series",
      year: 2024,
      tvdbId: 10,
      monitored: true,
      qualityProfileId: 9,
      seasonCount: 1,
      status: "continuing",
      seriesType: "standard",
      path: "/tv/tracked-series",
      rootFolderPath: "/tv",
      statistics: {
        seasonCount: 1,
        episodeFileCount: 1,
        episodeCount: 1,
        totalEpisodeCount: 1,
        sizeOnDisk: 100,
        percentOfEpisodes: 100,
      },
    }], new Map([
      [200, [{
        id: 201,
        seriesId: 200,
        seasonNumber: 1,
        episodeNumber: 2,
        title: "Episode Two",
        monitored: true,
        hasFile: true,
      }]],
    ]));

    const refreshed = testDb.select().from(schema.cachedEpisodes)
      .where(and(eq(schema.cachedEpisodes.instanceId, instance.id), eq(schema.cachedEpisodes.externalId, 201)))
      .get();

    expect(refreshed).toMatchObject({
      belowCutoff: true,
      wantedQualityName: "Bluray-2160p",
      qualityLastSearchAt: "2026-03-08T19:30:28.000Z",
    });
  });
});
