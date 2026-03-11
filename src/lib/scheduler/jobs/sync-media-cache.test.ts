import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../db/schema";

let testDb: ReturnType<typeof drizzle>;
let sqlite: InstanceType<typeof Database>;

const mockGetMovies = vi.fn();
const mockGetSeries = vi.fn();
const mockGetEpisodes = vi.fn();
const mockSyncMovieCache = vi.fn();
const mockSyncSeriesCache = vi.fn();
const mockWriteAuditLog = vi.fn();
const mockLoggerInfo = vi.fn();
const mockLoggerWarn = vi.fn();
const mockLoggerError = vi.fn();

vi.mock("../../db", () => ({
  getDb: () => testDb,
}));

vi.mock("../../crypto", () => ({
  decrypt: (value: string) => value,
}));

vi.mock("../../services/issue-service", () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}));

vi.mock("../../services/media-cache-service", () => ({
  syncMovieCache: (...args: unknown[]) => mockSyncMovieCache(...args),
  syncSeriesCache: (...args: unknown[]) => mockSyncSeriesCache(...args),
}));

vi.mock("../../arr-client/client", () => ({
  ArrClient: class {
    getMovies = mockGetMovies;
    getSeries = mockGetSeries;
    getEpisodes = mockGetEpisodes;
  },
}));

vi.mock("../../utils/logger", () => ({
  createLogger: () => ({
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: mockLoggerError,
  }),
}));

const CREATE_SQL = `
  CREATE TABLE IF NOT EXISTS instances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_key TEXT NOT NULL,
    poll_interval_seconds INTEGER NOT NULL DEFAULT 300,
    quality_check_interval_seconds INTEGER NOT NULL DEFAULT 1800,
    quality_check_max_items INTEGER NOT NULL DEFAULT 50,
    quality_check_strategy TEXT NOT NULL DEFAULT 'oldest_search',
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
`;

function setupDb() {
  sqlite = new Database(":memory:");
  testDb = drizzle(sqlite, { schema });
  sqlite.exec(CREATE_SQL);
}

describe("syncMediaCache", () => {
  beforeEach(() => {
    setupDb();
    mockGetMovies.mockReset();
    mockGetSeries.mockReset();
    mockGetEpisodes.mockReset();
    mockSyncMovieCache.mockReset();
    mockSyncSeriesCache.mockReset();
    mockWriteAuditLog.mockReset();
    mockLoggerInfo.mockReset();
    mockLoggerWarn.mockReset();
    mockLoggerError.mockReset();
  });

  it("skips Radarr cache sync when API returns empty movies", async () => {
    const instance = testDb.insert(schema.instances).values({
      name: "Radarr",
      type: "radarr",
      baseUrl: "http://localhost:7878",
      apiKey: "secret",
    }).returning().get()!;

    mockGetMovies.mockResolvedValue([]);

    const { syncMediaCache } = await import("./sync-media-cache");
    await syncMediaCache(instance);

    expect(mockGetMovies).toHaveBeenCalled();
    expect(mockSyncMovieCache).not.toHaveBeenCalled();
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ instanceId: instance.id }),
      expect.stringContaining("empty movie list"),
    );
  });

  it("syncs Radarr cache normally when API returns movies", async () => {
    const instance = testDb.insert(schema.instances).values({
      name: "Radarr",
      type: "radarr",
      baseUrl: "http://localhost:7878",
      apiKey: "secret",
    }).returning().get()!;

    const movies = [{ id: 1, title: "Movie A" }, { id: 2, title: "Movie B" }];
    mockGetMovies.mockResolvedValue(movies);

    const { syncMediaCache } = await import("./sync-media-cache");
    await syncMediaCache(instance);

    expect(mockSyncMovieCache).toHaveBeenCalledWith(instance.id, movies);
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "media_sync",
        details: expect.objectContaining({ type: "radarr", movieCount: 2 }),
      }),
    );
  });

  it("skips Sonarr cache sync when API returns empty series", async () => {
    const instance = testDb.insert(schema.instances).values({
      name: "Sonarr",
      type: "sonarr",
      baseUrl: "http://localhost:8989",
      apiKey: "secret",
    }).returning().get()!;

    mockGetSeries.mockResolvedValue([]);

    const { syncMediaCache } = await import("./sync-media-cache");
    await syncMediaCache(instance);

    expect(mockGetSeries).toHaveBeenCalled();
    expect(mockSyncSeriesCache).not.toHaveBeenCalled();
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ instanceId: instance.id }),
      expect.stringContaining("empty series list"),
    );
  });

  it("syncs Sonarr cache normally when API returns series", async () => {
    const instance = testDb.insert(schema.instances).values({
      name: "Sonarr",
      type: "sonarr",
      baseUrl: "http://localhost:8989",
      apiKey: "secret",
    }).returning().get()!;

    const seriesList = [{ id: 10, title: "Show A" }, { id: 20, title: "Show B" }];
    const episodes = [{ id: 100, seriesId: 10 }, { id: 101, seriesId: 10 }];
    mockGetSeries.mockResolvedValue(seriesList);
    mockGetEpisodes.mockResolvedValue(episodes);

    const { syncMediaCache } = await import("./sync-media-cache");
    await syncMediaCache(instance);

    expect(mockSyncSeriesCache).toHaveBeenCalledWith(
      instance.id,
      seriesList,
      expect.any(Map),
    );
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "media_sync",
        details: expect.objectContaining({ type: "sonarr", seriesCount: 2 }),
      }),
    );
  });
});
