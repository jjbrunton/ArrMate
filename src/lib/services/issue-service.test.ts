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

describe("issue-service", () => {
  beforeEach(() => {
    setupDb();
  });

  it("filters recent audit log entries by action", async () => {
    const { getRecentAuditLogByActions } = await import("./issue-service");

    const instance = testDb.insert(schema.instances).values({
      name: "Radarr",
      type: "radarr",
      baseUrl: "http://localhost:7878",
      apiKey: "secret",
    }).returning().get()!;

    testDb.insert(schema.auditLog).values([
      {
        instanceId: instance.id,
        action: "queue_sync",
        source: "system",
        createdAt: "2026-03-08T10:00:00.000Z",
      },
      {
        instanceId: instance.id,
        action: "quality_search_sent",
        source: "user",
        details: JSON.stringify({ requestedCount: 2, commandName: "MoviesSearch" }),
        createdAt: "2026-03-08T11:00:00.000Z",
      },
      {
        instanceId: instance.id,
        action: "quality_search_sent",
        source: "automation",
        details: JSON.stringify({ requestedCount: 1, commandName: "MoviesSearch" }),
        createdAt: "2026-03-08T12:00:00.000Z",
      },
    ]).run();

    const entries = getRecentAuditLogByActions(["quality_search_sent"], 50);

    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.action)).toEqual([
      "quality_search_sent",
      "quality_search_sent",
    ]);
    expect(entries.map((entry) => entry.source)).toEqual([
      "automation",
      "user",
    ]);
  });

  it("applies afterId and limit when filtering by action", async () => {
    const { getRecentAuditLogByActions } = await import("./issue-service");

    const instance = testDb.insert(schema.instances).values({
      name: "Sonarr",
      type: "sonarr",
      baseUrl: "http://localhost:8989",
      apiKey: "secret",
    }).returning().get()!;

    const first = testDb.insert(schema.auditLog).values({
      instanceId: instance.id,
      action: "quality_search_sent",
      source: "user",
      createdAt: "2026-03-08T09:00:00.000Z",
    }).returning().get()!;

    testDb.insert(schema.auditLog).values([
      {
        instanceId: instance.id,
        action: "quality_search_sent",
        source: "automation",
        createdAt: "2026-03-08T10:00:00.000Z",
      },
      {
        instanceId: instance.id,
        action: "quality_search_sent",
        source: "user",
        createdAt: "2026-03-08T11:00:00.000Z",
      },
    ]).run();

    const entries = getRecentAuditLogByActions(["quality_search_sent"], 1, first.id);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.source).toBe("user");
    expect(entries[0]?.id).toBeGreaterThan(first.id);
  });
});
