import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
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
  CREATE UNIQUE INDEX IF NOT EXISTS imported_requests_instance_external_id_idx
    ON imported_requests (instance_id, external_id);
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instance_id INTEGER,
    issue_id INTEGER,
    action TEXT NOT NULL,
    source TEXT NOT NULL,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
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

describe("request-service", () => {
  beforeEach(() => {
    setupDb();
  });

  it("syncs imported requests and drops stale rows", async () => {
    const { listImportedRequests, syncImportedRequests } = await import("./request-service");

    const instance = testDb.insert(schema.instances).values({
      name: "Overseerr",
      type: "overseerr",
      baseUrl: "http://localhost:5055",
      apiKey: "secret",
    }).returning().get()!;

    syncImportedRequests(instance.id, [
      {
        externalId: 1,
        mediaType: "movie",
        title: "Existing",
        tmdbId: 10,
        status: "approved",
        requestedByDisplayName: "Jamie",
        updatedAt: "2026-03-08T20:00:00.000Z",
      },
    ]);

    syncImportedRequests(instance.id, [
      {
        externalId: 2,
        mediaType: "tv",
        title: "Replacement",
        tmdbId: 20,
        status: "available",
        requestedByDisplayName: "Alex",
        updatedAt: "2026-03-08T20:05:00.000Z",
      },
    ]);

    expect(listImportedRequests(instance.id)).toMatchObject([
      {
        externalId: 2,
        title: "Replacement",
      },
    ]);
  });

  it("summarizes imported request counts", async () => {
    const { getImportedRequestStats, syncImportedRequests } = await import("./request-service");

    const instance = testDb.insert(schema.instances).values({
      name: "Overseerr",
      type: "overseerr",
      baseUrl: "http://localhost:5055",
      apiKey: "secret",
    }).returning().get()!;

    syncImportedRequests(instance.id, [
      {
        externalId: 1,
        mediaType: "movie",
        title: "Pending",
        status: "pending approval",
        requestedByDisplayName: "Jamie",
        updatedAt: "2026-03-08T20:00:00.000Z",
      },
      {
        externalId: 2,
        mediaType: "tv",
        title: "Available",
        status: "available",
        requestedByDisplayName: "Alex",
        updatedAt: "2026-03-08T20:05:00.000Z",
      },
    ]);

    expect(getImportedRequestStats(instance.id)).toEqual({
      instanceId: instance.id,
      totalRequests: 2,
      pendingRequests: 1,
      availableRequests: 1,
    });
  });

  it("imports Overseerr requests with normalized status, user, and titles", async () => {
    const { listImportedRequests, syncOverseerrRequests } = await import("./request-service");

    const instance = testDb.insert(schema.instances).values({
      name: "Overseerr",
      type: "overseerr",
      baseUrl: "http://localhost:5055",
      apiKey: "secret",
      requestSyncIntervalSeconds: 300,
    }).returning().get()!;

    const client = {
      getAllRequests: vi.fn().mockResolvedValue([
        {
          id: 7,
          type: "movie",
          status: 2,
          createdAt: "2026-03-08T20:00:00.000Z",
          updatedAt: "2026-03-08T20:10:00.000Z",
          requestedBy: {
            displayName: "Jamie",
            email: "jamie@example.com",
          },
          media: {
            tmdbId: 603,
            status: 5,
          },
        },
      ]),
      getMovieDetails: vi.fn().mockResolvedValue({ id: 603, title: "The Matrix" }),
      getTvDetails: vi.fn(),
    };

    await syncOverseerrRequests(instance, client);

    expect(listImportedRequests(instance.id)).toMatchObject([
      {
        externalId: 7,
        title: "The Matrix",
        status: "available",
        requestedByDisplayName: "Jamie",
        requestedByEmail: "jamie@example.com",
      },
    ]);
  });
});
