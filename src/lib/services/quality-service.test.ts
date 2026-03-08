import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import type { QualityInfo, QualityProfile } from "../arr-client/types";

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
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instance_id INTEGER,
    issue_id INTEGER,
    action TEXT NOT NULL,
    source TEXT NOT NULL,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (instance_id) REFERENCES instances(id) ON DELETE SET NULL
  );
  CREATE TABLE IF NOT EXISTS quality_search_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instance_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    source TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (instance_id) REFERENCES instances(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS cached_movies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instance_id INTEGER NOT NULL,
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
    synced_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (instance_id) REFERENCES instances(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS cached_series (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instance_id INTEGER NOT NULL,
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
    synced_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (instance_id) REFERENCES instances(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS cached_episodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instance_id INTEGER NOT NULL,
    series_cache_id INTEGER NOT NULL,
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
    synced_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (instance_id) REFERENCES instances(id) ON DELETE CASCADE,
    FOREIGN KEY (series_cache_id) REFERENCES cached_series(id) ON DELETE CASCADE
  );
`;

const webdl1080p: QualityInfo = {
  quality: { id: 3, name: "WEBDL-1080p", source: "webdl", resolution: 1080 },
  revision: { version: 1, real: 0, isRepack: false },
};

const bluray2160p: QualityInfo = {
  quality: { id: 19, name: "Bluray-2160p", source: "bluray", resolution: 2160 },
  revision: { version: 1, real: 0, isRepack: false },
};

const qualityProfiles: QualityProfile[] = [
  {
    id: 1,
    name: "Ultra HD",
    cutoff: 19,
    upgradeAllowed: true,
    items: [
      {
        allowed: true,
        items: [],
        quality: bluray2160p.quality,
      },
    ],
  },
];

vi.mock("../db", () => ({
  getDb: () => testDb,
}));

function setupDb() {
  sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  testDb = drizzle(sqlite, { schema });
  sqlite.exec(CREATE_SQL);
}

describe("quality-service", () => {
  beforeEach(() => {
    setupDb();
    vi.useRealTimers();
  });

  it("builds the Radarr quality page from cached state and aggregated history", async () => {
    const {
      getRecentQualitySearchBatches,
      getQualityPage,
      recordQualitySearch,
      syncQualitySnapshot,
    } = await import("./quality-service");

    const instance = testDb.insert(schema.instances).values({
      name: "Radarr",
      type: "radarr",
      baseUrl: "http://localhost:7878",
      apiKey: "secret",
    }).returning().get()!;

    testDb.insert(schema.cachedMovies).values([
      {
        instanceId: instance.id,
        externalId: 10,
        title: "Healthy",
        monitored: true,
        hasFile: true,
        movieFileQuality: JSON.stringify(bluray2160p),
      },
      {
        instanceId: instance.id,
        externalId: 11,
        title: "Wrong Quality",
        monitored: true,
        hasFile: true,
        movieFileQuality: JSON.stringify(webdl1080p),
      },
      {
        instanceId: instance.id,
        externalId: 12,
        title: "Missing",
        monitored: true,
        hasFile: false,
      },
    ]).run();

    syncQualitySnapshot(instance.id, "radarr", [
      {
        id: 11,
        title: "Wrong Quality",
        year: 2024,
        qualityProfileId: 1,
        lastSearchTime: "2026-03-06T09:00:00.000Z",
        movieFile: { quality: webdl1080p },
      },
    ], qualityProfiles);

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-08T12:00:00.000Z"));
    recordQualitySearch(instance.id, [11], "user", {
      id: 1,
      commandName: "MoviesSearch",
      name: "MoviesSearch",
      status: "queued",
    });
    recordQualitySearch(instance.id, [11], "automation");

    const page = getQualityPage(instance.id, "radarr", 1, 20);

    expect(page.totalRecords).toBe(1);
    expect(page.statusSummary).toEqual({
      trackedItems: 3,
      healthy: 1,
      wrongQuality: 1,
      missing: 1,
    });
    expect(page.upgradeHistory).toEqual({
      totalBatchesSent: 2,
      totalItemsSent: 2,
      lastSearchSentAt: "2026-03-08T12:00:00.000Z",
    });
    expect(page.recentSearches).toEqual([
      {
        source: "automation",
        requestedCount: 1,
        createdAt: "2026-03-08T12:00:00.000Z",
        items: [{ id: 11, label: "Wrong Quality" }],
      },
      {
        source: "user",
        requestedCount: 1,
        createdAt: "2026-03-08T12:00:00.000Z",
        items: [{ id: 11, label: "Wrong Quality" }],
      },
    ]);
    expect(page.records[0]).toMatchObject({
      id: 11,
      title: "Wrong Quality",
      wantedQualityName: "Bluray-2160p",
      upgradeSearchCount: 2,
      lastUpgradeSearchAt: "2026-03-08T12:00:00.000Z",
      lastCheckAt: "2026-03-08T12:00:00.000Z",
      nextCheckAt: "2026-03-09T12:00:00.000Z",
    });
    expect(page.records[0].movieFile?.quality).toEqual(webdl1080p);
    expect(getRecentQualitySearchBatches(instance.id, "radarr", 1)).toEqual([
      {
        source: "automation",
        requestedCount: 1,
        createdAt: "2026-03-08T12:00:00.000Z",
        items: [{ id: 11, label: "Wrong Quality" }],
      },
    ]);
  });

  it("filters the Sonarr quality page to aired monitored episodes on monitored series", async () => {
    const { getQualityPage, syncQualitySnapshot } = await import("./quality-service");

    const instance = testDb.insert(schema.instances).values({
      name: "Sonarr",
      type: "sonarr",
      baseUrl: "http://localhost:8989",
      apiKey: "secret",
    }).returning().get()!;

    const monitoredSeries = testDb.insert(schema.cachedSeries).values({
      instanceId: instance.id,
      externalId: 100,
      title: "Tracked Series",
      monitored: true,
      qualityProfileId: 1,
    }).returning().get()!;

    const unmonitoredSeries = testDb.insert(schema.cachedSeries).values({
      instanceId: instance.id,
      externalId: 101,
      title: "Ignored Series",
      monitored: false,
      qualityProfileId: 1,
    }).returning().get()!;

    testDb.insert(schema.cachedEpisodes).values([
      {
        instanceId: instance.id,
        seriesCacheId: monitoredSeries.id,
        seriesExternalId: 100,
        externalId: 201,
        seasonNumber: 1,
        episodeNumber: 1,
        title: "Healthy",
        monitored: true,
        hasFile: true,
        airDateUtc: "2026-03-01T12:00:00.000Z",
        episodeFileQuality: JSON.stringify(bluray2160p),
      },
      {
        instanceId: instance.id,
        seriesCacheId: monitoredSeries.id,
        seriesExternalId: 100,
        externalId: 202,
        seasonNumber: 1,
        episodeNumber: 2,
        title: "Wrong Quality",
        monitored: true,
        hasFile: true,
        airDateUtc: "2026-03-02T12:00:00.000Z",
        episodeFileQuality: JSON.stringify(webdl1080p),
      },
      {
        instanceId: instance.id,
        seriesCacheId: monitoredSeries.id,
        seriesExternalId: 100,
        externalId: 203,
        seasonNumber: 1,
        episodeNumber: 3,
        title: "Missing",
        monitored: true,
        hasFile: false,
        airDateUtc: "2026-03-03T12:00:00.000Z",
      },
      {
        instanceId: instance.id,
        seriesCacheId: monitoredSeries.id,
        seriesExternalId: 100,
        externalId: 204,
        seasonNumber: 1,
        episodeNumber: 4,
        title: "Future",
        monitored: true,
        hasFile: true,
        airDateUtc: "2026-03-20T12:00:00.000Z",
        episodeFileQuality: JSON.stringify(webdl1080p),
      },
      {
        instanceId: instance.id,
        seriesCacheId: unmonitoredSeries.id,
        seriesExternalId: 101,
        externalId: 205,
        seasonNumber: 1,
        episodeNumber: 1,
        title: "Ignored",
        monitored: true,
        hasFile: true,
        airDateUtc: "2026-03-01T12:00:00.000Z",
        episodeFileQuality: JSON.stringify(webdl1080p),
      },
    ]).run();

    syncQualitySnapshot(instance.id, "sonarr", [
      {
        id: 202,
        series: { id: 100, title: "Tracked Series", qualityProfileId: 1 },
        episode: { title: "Wrong Quality", seasonNumber: 1, episodeNumber: 2 },
        lastSearchTime: "2026-03-06T10:00:00.000Z",
        episodeFile: { quality: webdl1080p },
      },
      {
        id: 204,
        series: { id: 100, title: "Tracked Series", qualityProfileId: 1 },
        episode: { title: "Future", seasonNumber: 1, episodeNumber: 4 },
        lastSearchTime: "2026-03-06T11:00:00.000Z",
        episodeFile: { quality: webdl1080p },
      },
      {
        id: 205,
        series: { id: 101, title: "Ignored Series", qualityProfileId: 1 },
        episode: { title: "Ignored", seasonNumber: 1, episodeNumber: 1 },
        lastSearchTime: "2026-03-06T12:00:00.000Z",
        episodeFile: { quality: webdl1080p },
      },
    ], qualityProfiles);

    const page = getQualityPage(
      instance.id,
      "sonarr",
      1,
      20,
      new Date("2026-03-08T12:00:00.000Z"),
    );

    expect(page.totalRecords).toBe(1);
    expect(page.statusSummary).toEqual({
      trackedItems: 3,
      healthy: 1,
      wrongQuality: 1,
      missing: 1,
    });
    expect(page.records[0]).toMatchObject({
      id: 202,
      wantedQualityName: "Bluray-2160p",
      lastCheckAt: "2026-03-06T10:00:00.000Z",
      nextCheckAt: "2026-03-07T10:00:00.000Z",
    });
    expect(page.records[0].series).toEqual({
      id: 100,
      title: "Tracked Series",
      qualityProfileId: 1,
    });
    expect(page.records[0].episode).toEqual({
      title: "Wrong Quality",
      seasonNumber: 1,
      episodeNumber: 2,
    });
  });

  it("clears stale below-cutoff flags when a new snapshot no longer includes an item", async () => {
    const { getQualityPage, syncQualitySnapshot } = await import("./quality-service");

    const instance = testDb.insert(schema.instances).values({
      name: "Radarr",
      type: "radarr",
      baseUrl: "http://localhost:7878",
      apiKey: "secret",
    }).returning().get()!;

    testDb.insert(schema.cachedMovies).values({
      instanceId: instance.id,
      externalId: 11,
      title: "Wrong Quality",
      monitored: true,
      hasFile: true,
      belowCutoff: true,
      wantedQualityName: "Old Cutoff",
      qualityLastSearchAt: "2026-03-01T00:00:00.000Z",
    }).run();

    syncQualitySnapshot(instance.id, "radarr", [], qualityProfiles);

    const page = getQualityPage(instance.id, "radarr", 1, 20);
    expect(page.totalRecords).toBe(0);

    const refreshed = testDb.select().from(schema.cachedMovies)
      .where(eq(schema.cachedMovies.instanceId, instance.id))
      .get();
    expect(refreshed).toMatchObject({
      belowCutoff: false,
      wantedQualityName: null,
      qualityLastSearchAt: "2026-03-01T00:00:00.000Z",
    });
  });

  it("preserves a newer locally recorded search time when syncing a stale Arr snapshot", async () => {
    const {
      getDueQualitySearchRecords,
      getQualitySearchLogItems,
      partitionQualitySearchableItemIds,
      syncQualitySnapshot,
    } = await import("./quality-service");

    const instance = testDb.insert(schema.instances).values({
      name: "Radarr",
      type: "radarr",
      baseUrl: "http://localhost:7878",
      apiKey: "secret",
    }).returning().get()!;

    testDb.insert(schema.cachedMovies).values({
      instanceId: instance.id,
      externalId: 11,
      title: "Wrong Quality",
      monitored: true,
      hasFile: true,
      belowCutoff: true,
      wantedQualityName: "Old Cutoff",
      qualityLastSearchAt: "2026-03-08T11:30:00.000Z",
    }).run();

    syncQualitySnapshot(instance.id, "radarr", [
      {
        id: 11,
        title: "Wrong Quality",
        qualityProfileId: 1,
        lastSearchTime: "2026-03-07T09:00:00.000Z",
        movieFile: { quality: webdl1080p },
      },
    ], qualityProfiles);

    const refreshed = testDb.select().from(schema.cachedMovies)
      .where(eq(schema.cachedMovies.instanceId, instance.id))
      .get();
    expect(refreshed?.qualityLastSearchAt).toBe("2026-03-08T11:30:00.000Z");

    const dueRecords = getDueQualitySearchRecords(
      instance.id,
      "radarr",
      [{ id: 11, lastSearchTime: "2026-03-07T09:00:00.000Z" }],
      50,
      new Date("2026-03-08T12:00:00.000Z"),
    );
    expect(dueRecords).toEqual([]);

    expect(partitionQualitySearchableItemIds(
      instance.id,
      "radarr",
      [11],
      new Date("2026-03-08T12:00:00.000Z"),
    )).toEqual({
      searchableIds: [],
      skippedIds: [11],
    });

    expect(getQualitySearchLogItems(instance.id, "radarr", [11, 999])).toEqual([
      { id: 11, label: "Wrong Quality" },
      { id: 999, label: "Unknown movie (999)" },
    ]);
  });

  it("builds Sonarr quality search log labels from cached series and episode rows", async () => {
    const { getQualitySearchLogItems } = await import("./quality-service");

    const instance = testDb.insert(schema.instances).values({
      name: "Sonarr",
      type: "sonarr",
      baseUrl: "http://localhost:8989",
      apiKey: "secret",
    }).returning().get()!;

    const series = testDb.insert(schema.cachedSeries).values({
      instanceId: instance.id,
      externalId: 100,
      title: "Tracked Series",
      monitored: true,
      qualityProfileId: 1,
    }).returning().get()!;

    testDb.insert(schema.cachedEpisodes).values({
      instanceId: instance.id,
      seriesCacheId: series.id,
      seriesExternalId: 100,
      externalId: 202,
      seasonNumber: 1,
      episodeNumber: 2,
      title: "Wrong Quality",
      monitored: true,
      hasFile: true,
    }).run();

    expect(getQualitySearchLogItems(instance.id, "sonarr", [202, 999])).toEqual([
      { id: 202, label: "Tracked Series S01E02 - Wrong Quality" },
      { id: 999, label: "Unknown episode (999)" },
    ]);
  });
});
