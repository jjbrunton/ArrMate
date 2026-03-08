import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import type { Episode, Movie, QueueRecord, Series } from "../arr-client/types";

// We'll mock the db module to use an in-memory database
let testDb: ReturnType<typeof drizzle>;
let sqlite: InstanceType<typeof Database>;

vi.mock("../db", () => ({
  getDb: () => testDb,
}));

// Also mock crypto since tests don't have ENCRYPTION_KEY
vi.mock("../crypto", () => ({
  encrypt: (val: string) => `encrypted:${val}`,
  decrypt: (val: string) => val.replace("encrypted:", ""),
}));

// Mock the ArrClient connection test
vi.mock("../arr-client/client", () => {
  const MockArrClient = class {
    async testConnection() {
      return { appName: "Radarr", version: "5.0", urlBase: "" };
    }
  };
  return { ArrClient: MockArrClient };
});

vi.mock("../overseerr-client/client", () => {
  const MockOverseerrClient = class {
    async testConnection() {
      return { appName: "Overseerr", version: "1.0.0" };
    }
  };
  return { OverseerrClient: MockOverseerrClient };
});

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

  CREATE TABLE IF NOT EXISTS queue_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instance_id INTEGER NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    external_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    status TEXT,
    tracked_download_state TEXT,
    tracked_download_status TEXT,
    status_messages TEXT,
    protocol TEXT,
    download_client TEXT,
    size_bytes INTEGER,
    size_left_bytes INTEGER,
    timeleft TEXT,
    estimated_completion_time TEXT,
    download_id TEXT,
    output_path TEXT,
    first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    is_gone INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS detected_issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instance_id INTEGER NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    queue_item_id INTEGER REFERENCES queue_items(id) ON DELETE SET NULL,
    external_queue_id INTEGER,
    type TEXT NOT NULL,
    severity TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    detected_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT
  );

  CREATE TABLE IF NOT EXISTS suggested_fixes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_id INTEGER NOT NULL REFERENCES detected_issues(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    label TEXT NOT NULL,
    description TEXT,
    priority INTEGER NOT NULL DEFAULT 0,
    automatable INTEGER NOT NULL DEFAULT 0,
    params TEXT,
    executed_at TEXT,
    execution_result TEXT
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instance_id INTEGER REFERENCES instances(id) ON DELETE SET NULL,
    issue_id INTEGER REFERENCES detected_issues(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    source TEXT NOT NULL,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS quality_search_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instance_id INTEGER NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL,
    source TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS imported_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instance_id INTEGER NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    external_id INTEGER NOT NULL,
    media_type TEXT NOT NULL,
    title TEXT NOT NULL,
    tmdb_id INTEGER,
    request_status INTEGER,
    media_status INTEGER,
    status TEXT NOT NULL,
    requested_by_display_name TEXT NOT NULL,
    requested_by_email TEXT,
    requested_at TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS auth_admin (
    id INTEGER PRIMARY KEY NOT NULL,
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS auth_sessions (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    ip_address TEXT,
    user_agent TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS auth_login_attempts (
    ip_address TEXT PRIMARY KEY,
    failure_count INTEGER NOT NULL DEFAULT 0,
    first_failed_at TEXT NOT NULL,
    last_failed_at TEXT NOT NULL,
    blocked_until TEXT
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

function setupDb() {
  sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  testDb = drizzle(sqlite, { schema });
  sqlite.exec(CREATE_SQL);
}

describe("Service Integration Tests", () => {
  beforeEach(() => {
    setupDb();
  });

  describe("instance-service", () => {
    it("creates and lists instances", async () => {
      const { createInstance, listInstances } = await import("../services/instance-service");

      const instance = await createInstance({
        name: "Test Radarr",
        type: "radarr",
        baseUrl: "http://localhost:7878",
        apiKey: "my-api-key",
      });

      expect(instance.name).toBe("Test Radarr");
      expect(instance.type).toBe("radarr");
      expect(instance.qualityCheckMaxItems).toBe(50);
      expect(instance).not.toHaveProperty("apiKey");

      const all = listInstances();
      expect(all).toHaveLength(1);
      expect(all[0].name).toBe("Test Radarr");
    });

    it("creates Overseerr instances with request sync settings", async () => {
      const { createInstance } = await import("../services/instance-service");

      const instance = await createInstance({
        name: "Requests",
        type: "overseerr",
        baseUrl: "http://localhost:5055",
        apiKey: "my-api-key",
        requestSyncIntervalSeconds: 900,
      });

      expect(instance.type).toBe("overseerr");
      expect(instance.requestSyncIntervalSeconds).toBe(900);
      expect(instance).not.toHaveProperty("apiKey");
    });

    it("gets instance by id", async () => {
      const { createInstance, getInstance } = await import("../services/instance-service");

      const created = await createInstance({
        name: "My Instance",
        type: "sonarr",
        baseUrl: "http://localhost:8989",
        apiKey: "key",
      });

      const fetched = getInstance(created.id);
      expect(fetched).toBeDefined();
      expect(fetched!.name).toBe("My Instance");
    });

    it("updates quality check batch size", async () => {
      const { createInstance, updateInstance, getInstance } = await import("../services/instance-service");

      const created = await createInstance({
        name: "My Instance",
        type: "sonarr",
        baseUrl: "http://localhost:8989",
        apiKey: "key",
      });

      await updateInstance(created.id, { qualityCheckMaxItems: 25 });

      const fetched = getInstance(created.id);
      expect(fetched?.qualityCheckMaxItems).toBe(25);
    });

    it("deletes instance", async () => {
      const { createInstance, deleteInstance, listInstances } = await import("../services/instance-service");

      const inst = await createInstance({
        name: "To Delete",
        type: "radarr",
        baseUrl: "http://localhost:7878",
        apiKey: "key",
      });

      expect(deleteInstance(inst.id)).toBe(true);
      expect(listInstances()).toHaveLength(0);
    });

    it("removes the deleted instance's local data and audit history", async () => {
      const { createInstance, deleteInstance } = await import("../services/instance-service");

      const inst = await createInstance({
        name: "To Delete",
        type: "radarr",
        baseUrl: "http://localhost:7878",
        apiKey: "key",
      });
      const other = await createInstance({
        name: "Keep Me",
        type: "sonarr",
        baseUrl: "http://localhost:8989",
        apiKey: "key",
      });

      const queueItem = testDb.insert(schema.queueItems).values({
        instanceId: inst.id,
        externalId: 101,
        title: "Movie A",
      }).returning().get()!;
      const issue = testDb.insert(schema.detectedIssues).values({
        instanceId: inst.id,
        queueItemId: queueItem.id,
        externalQueueId: 101,
        type: "failed",
        severity: "critical",
        title: "Failed import",
        description: "Import failed",
      }).returning().get()!;

      testDb.insert(schema.suggestedFixes).values({
        issueId: issue.id,
        action: "retry_download",
        label: "Retry download",
      }).run();
      testDb.insert(schema.auditLog).values({
        instanceId: inst.id,
        issueId: issue.id,
        action: "queue_sync",
        source: "system",
      }).run();
      testDb.insert(schema.qualitySearchItems).values({
        instanceId: inst.id,
        itemId: 101,
        source: "user",
      }).run();

      testDb.insert(schema.cachedMovies).values({
        instanceId: inst.id,
        externalId: 101,
        title: "Movie A",
      }).run();
      const series = testDb.insert(schema.cachedSeries).values({
        instanceId: inst.id,
        externalId: 201,
        title: "Series A",
      }).returning().get()!;
      testDb.insert(schema.cachedEpisodes).values({
        instanceId: inst.id,
        seriesCacheId: series.id,
        externalId: 301,
        seriesExternalId: 201,
        seasonNumber: 1,
        episodeNumber: 1,
      }).run();

      testDb.insert(schema.auditLog).values({
        instanceId: other.id,
        action: "health_restored",
        source: "system",
      }).run();

      expect(deleteInstance(inst.id)).toBe(true);

      expect(testDb.select().from(schema.instances).all().map((row) => row.id)).toEqual([other.id]);
      expect(testDb.select().from(schema.queueItems).all()).toHaveLength(0);
      expect(testDb.select().from(schema.detectedIssues).all()).toHaveLength(0);
      expect(testDb.select().from(schema.suggestedFixes).all()).toHaveLength(0);
      expect(testDb.select().from(schema.qualitySearchItems).all()).toHaveLength(0);
      expect(testDb.select().from(schema.cachedMovies).all()).toHaveLength(0);
      expect(testDb.select().from(schema.cachedSeries).all()).toHaveLength(0);
      expect(testDb.select().from(schema.cachedEpisodes).all()).toHaveLength(0);
      expect(testDb.select().from(schema.auditLog).all()).toHaveLength(1);
      expect(testDb.select().from(schema.auditLog).get()).toMatchObject({
        instanceId: other.id,
        action: "health_restored",
      });
    });

    it("returns false for deleting non-existent instance", async () => {
      const { deleteInstance } = await import("../services/instance-service");
      expect(deleteInstance(999)).toBe(false);
    });
  });

  describe("queue-service", () => {
    it("syncs queue items from API records", async () => {
      const { createInstance } = await import("../services/instance-service");
      const { syncQueueItems } = await import("../services/queue-service");

      const inst = await createInstance({
        name: "Test",
        type: "radarr",
        baseUrl: "http://localhost:7878",
        apiKey: "key",
      });

      const records = [
        {
          id: 100,
          title: "Movie A",
          status: "downloading",
          trackedDownloadState: "downloading",
          trackedDownloadStatus: "ok",
          statusMessages: [],
          protocol: "torrent",
          downloadClient: "qBittorrent",
          size: 1000000,
          sizeleft: 500000,
          timeleft: "01:00:00",
          estimatedCompletionTime: null,
        },
      ];

      const synced = syncQueueItems(inst.id, records);
      expect(synced).toHaveLength(1);
      expect(synced[0].title).toBe("Movie A");
      expect(synced[0].externalId).toBe(100);
    });

    it("marks items as gone when they disappear from queue", async () => {
      const { createInstance } = await import("../services/instance-service");
      const { syncQueueItems, getQueueItems } = await import("../services/queue-service");

      const inst = await createInstance({
        name: "Test",
        type: "radarr",
        baseUrl: "http://localhost:7878",
        apiKey: "key",
      });

      // First sync: item exists
      const initialQueue: QueueRecord[] = [{
        id: 100, title: "Movie A", status: "downloading",
        trackedDownloadState: "downloading", trackedDownloadStatus: "ok",
        statusMessages: [], protocol: "torrent", downloadClient: "qBit",
        size: 1000, sizeleft: 500, timeleft: null, estimatedCompletionTime: null,
      }];

      syncQueueItems(inst.id, initialQueue);

      // Second sync: item gone
      syncQueueItems(inst.id, []);

      const items = getQueueItems(inst.id, false);
      expect(items).toHaveLength(0);

      const allItems = getQueueItems(inst.id, true);
      expect(allItems).toHaveLength(1);
      expect(allItems[0].isGone).toBe(true);
    });
  });

  describe("issue-service", () => {
    it("persists and retrieves detected issues", async () => {
      const { createInstance } = await import("../services/instance-service");
      const { syncQueueItems } = await import("../services/queue-service");
      const { persistDetectedIssues, getActiveIssues } = await import("../services/issue-service");

      const inst = await createInstance({
        name: "Test",
        type: "radarr",
        baseUrl: "http://localhost:7878",
        apiKey: "key",
      });

      const synced = syncQueueItems(inst.id, [{
        id: 100, title: "Movie A", status: "downloading",
        trackedDownloadState: "failed", trackedDownloadStatus: "warning",
        statusMessages: [], protocol: "torrent", downloadClient: "qBit",
        size: 1000, sizeleft: 0, timeleft: null, estimatedCompletionTime: null,
      }]);

      persistDetectedIssues(inst.id, [{
        queueItem: synced[0],
        issue: {
          type: "failed",
          severity: "critical",
          title: "Download failed",
          description: "The download failed",
          suggestedFixes: [
            {
              action: "retry_download",
              label: "Retry",
              description: "Retry the download",
              priority: 1,
              automatable: true,
            },
          ],
        },
      }]);

      const issues = getActiveIssues(inst.id);
      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe("failed");
      expect(issues[0].fixes).toHaveLength(1);
      expect(issues[0].fixes[0].action).toBe("retry_download");
    });

    it("dismisses an issue", async () => {
      const { createInstance } = await import("../services/instance-service");
      const { syncQueueItems } = await import("../services/queue-service");
      const { persistDetectedIssues, dismissIssue, getActiveIssues, getIssue } = await import("../services/issue-service");

      const inst = await createInstance({
        name: "Test", type: "radarr",
        baseUrl: "http://localhost:7878", apiKey: "key",
      });

      const synced = syncQueueItems(inst.id, [{
        id: 200, title: "Movie B", status: "downloading",
        trackedDownloadState: "failed", trackedDownloadStatus: "warning",
        statusMessages: [], protocol: "torrent", downloadClient: "qBit",
        size: 1000, sizeleft: 0, timeleft: null, estimatedCompletionTime: null,
      }]);

      persistDetectedIssues(inst.id, [{
        queueItem: synced[0],
        issue: {
          type: "failed", severity: "critical",
          title: "Failed", description: "Failed",
          suggestedFixes: [],
        },
      }]);

      const issues = getActiveIssues(inst.id);
      expect(dismissIssue(issues[0].id)).toBe(true);

      const dismissed = getIssue(issues[0].id);
      expect(dismissed?.status).toBe("dismissed");
    });

    it("gets dashboard stats", async () => {
      const { createInstance } = await import("../services/instance-service");
      const { getDashboardStats } = await import("../services/issue-service");

      await createInstance({
        name: "Healthy", type: "radarr",
        baseUrl: "http://localhost:7878", apiKey: "key",
      });

      const stats = getDashboardStats();
      expect(stats.totalInstances).toBe(1);
      expect(stats.activeIssues).toBe(0);
    });

    it("writes and reads audit log", async () => {
      const { createInstance } = await import("../services/instance-service");
      const { writeAuditLog, getRecentAuditLog } = await import("../services/issue-service");

      const inst = await createInstance({
        name: "Test", type: "radarr",
        baseUrl: "http://localhost:7878", apiKey: "key",
      });

      writeAuditLog({
        instanceId: inst.id,
        action: "test_action",
        source: "system",
        details: { note: "test" },
      });

      const logs = getRecentAuditLog(10);
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe("test_action");
      expect(logs[0].instanceName).toBe("Test");
    });

    it("resolves issues for gone queue items", async () => {
      const { createInstance } = await import("../services/instance-service");
      const { syncQueueItems } = await import("../services/queue-service");
      const { persistDetectedIssues, resolveIssuesForGoneItems, getActiveIssues } = await import("../services/issue-service");

      const inst = await createInstance({
        name: "Test", type: "radarr",
        baseUrl: "http://localhost:7878", apiKey: "key",
      });

      // Create a queue item and issue
      const synced = syncQueueItems(inst.id, [{
        id: 300, title: "Movie C", status: "downloading",
        trackedDownloadState: "failed", trackedDownloadStatus: "warning",
        statusMessages: [], protocol: "torrent", downloadClient: "qBit",
        size: 1000, sizeleft: 0, timeleft: null, estimatedCompletionTime: null,
      }]);

      persistDetectedIssues(inst.id, [{
        queueItem: synced[0],
        issue: {
          type: "failed", severity: "critical",
          title: "Failed", description: "Failed",
          suggestedFixes: [],
        },
      }]);

      // Mark queue item as gone
      syncQueueItems(inst.id, []);

      // Resolve issues for gone items
      resolveIssuesForGoneItems(inst.id);

      const issues = getActiveIssues(inst.id);
      expect(issues).toHaveLength(0);
    });

    it("dismisses all issues for an instance", async () => {
      const { createInstance } = await import("../services/instance-service");
      const { syncQueueItems } = await import("../services/queue-service");
      const { persistDetectedIssues, dismissAllIssues, getActiveIssues } = await import("../services/issue-service");

      const inst = await createInstance({
        name: "Test", type: "radarr",
        baseUrl: "http://localhost:7878", apiKey: "key",
      });

      const synced = syncQueueItems(inst.id, [
        {
          id: 400, title: "Movie D", status: "downloading",
          trackedDownloadState: "failed", trackedDownloadStatus: "warning",
          statusMessages: [], protocol: "torrent", downloadClient: "qBit",
          size: 1000, sizeleft: 0, timeleft: null, estimatedCompletionTime: null,
        },
        {
          id: 401, title: "Movie E", status: "downloading",
          trackedDownloadState: "failed", trackedDownloadStatus: "warning",
          statusMessages: [], protocol: "torrent", downloadClient: "qBit",
          size: 1000, sizeleft: 0, timeleft: null, estimatedCompletionTime: null,
        },
      ]);

      persistDetectedIssues(inst.id, synced.map((q) => ({
        queueItem: q,
        issue: {
          type: "failed" as const, severity: "critical" as const,
          title: "Failed", description: "Failed",
          suggestedFixes: [],
        },
      })));

      expect(getActiveIssues(inst.id)).toHaveLength(2);
      const count = dismissAllIssues(inst.id);
      expect(count).toBe(2);
      expect(getActiveIssues(inst.id)).toHaveLength(0);
    });
  });

  describe("media-cache-service", () => {
    it("returns grouped movie and episode totals for all instances", async () => {
      const { createInstance } = await import("../services/instance-service");
      const { syncMovieCache, syncSeriesCache, getAllMediaItemCounts } = await import("../services/media-cache-service");

      const radarr = await createInstance({
        name: "Movies",
        type: "radarr",
        baseUrl: "http://localhost:7878",
        apiKey: "key",
      });

      const sonarr = await createInstance({
        name: "TV",
        type: "sonarr",
        baseUrl: "http://localhost:8989",
        apiKey: "key",
      });

      const movies: Movie[] = [
        {
          id: 1,
          title: "Movie A",
          year: 2024,
          tmdbId: 101,
          hasFile: true,
          monitored: true,
        },
        {
          id: 2,
          title: "Movie B",
          year: 2025,
          tmdbId: 102,
          hasFile: false,
          monitored: true,
        },
      ];

      syncMovieCache(radarr.id, movies);

      const seriesList: Series[] = [
        {
          id: 10,
          title: "Series A",
          year: 2024,
          tvdbId: 201,
          status: "continuing",
          seriesType: "standard",
          monitored: true,
          qualityProfileId: 1,
          seasonCount: 1,
          path: "/tv/series-a",
          rootFolderPath: "/tv",
        },
      ];

      const episodesBySeriesId = new Map<number, Episode[]>([
        [
          10,
          [
            {
              id: 1001,
              seriesId: 10,
              seasonNumber: 1,
              episodeNumber: 1,
              title: "Episode 1",
              monitored: true,
              hasFile: true,
            },
            {
              id: 1002,
              seriesId: 10,
              seasonNumber: 1,
              episodeNumber: 2,
              title: "Episode 2",
              monitored: true,
              hasFile: false,
            },
            {
              id: 1003,
              seriesId: 10,
              seasonNumber: 1,
              episodeNumber: 3,
              title: "Episode 3",
              monitored: true,
              hasFile: false,
            },
          ],
        ],
      ]);

      syncSeriesCache(sonarr.id, seriesList, episodesBySeriesId);

      expect(getAllMediaItemCounts()).toEqual(
        expect.arrayContaining([
          { instanceId: radarr.id, movieCount: 2, episodeCount: 0 },
          { instanceId: sonarr.id, movieCount: 0, episodeCount: 3 },
        ]),
      );
    });
  });
});
