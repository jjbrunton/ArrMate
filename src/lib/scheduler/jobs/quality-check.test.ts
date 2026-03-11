import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";

let testDb: ReturnType<typeof drizzle>;
let sqlite: InstanceType<typeof Database>;

const mockSearchForUpgrade = vi.fn();
const mockGetAllCutoffUnmetItems = vi.fn();
const mockGetQualityProfiles = vi.fn();
const mockWriteAuditLog = vi.fn();
const mockRecordQualitySearch = vi.fn();
const mockSyncQualitySnapshot = vi.fn();
const mockGetDueQualitySearchRecords = vi.fn();
const mockRunExclusive = vi.fn();
const mockLoggerInfo = vi.fn();
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

vi.mock("../../services/quality-service", () => ({
  recordQualitySearch: (...args: unknown[]) => mockRecordQualitySearch(...args),
  syncQualitySnapshot: (...args: unknown[]) => mockSyncQualitySnapshot(...args),
  getDueQualitySearchRecords: (...args: unknown[]) => mockGetDueQualitySearchRecords(...args),
}));

vi.mock("../job-tracker", () => ({
  runExclusive: (...args: unknown[]) => mockRunExclusive(...args),
}));

vi.mock("../../arr-client/client", () => ({
  ArrClient: class {
    getAllCutoffUnmetItems = mockGetAllCutoffUnmetItems;
    getQualityProfiles = mockGetQualityProfiles;
    searchForUpgrade = mockSearchForUpgrade;
  },
}));

vi.mock("../../utils/logger", () => ({
  createLogger: () => ({
    info: mockLoggerInfo,
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

describe("runQualityChecks", () => {
  beforeEach(() => {
    setupDb();
    mockGetAllCutoffUnmetItems.mockReset();
    mockGetQualityProfiles.mockReset();
    mockSearchForUpgrade.mockReset();
    mockWriteAuditLog.mockReset();
    mockRecordQualitySearch.mockReset();
    mockSyncQualitySnapshot.mockReset();
    mockGetDueQualitySearchRecords.mockReset();
    mockRunExclusive.mockReset();
    mockLoggerInfo.mockReset();
    mockLoggerError.mockReset();
    mockRunExclusive.mockImplementation(async (_instanceId: number, _jobType: string, fn: () => Promise<void>) => {
      await fn();
      return true;
    });
    vi.useRealTimers();
  });

  it("triggers searches for overdue or never-checked items up to the instance limit", async () => {
    const instance = testDb.insert(schema.instances).values({
      name: "Radarr",
      type: "radarr",
      baseUrl: "http://localhost:7878",
      apiKey: "secret",
      qualityCheckMaxItems: 2,
    }).returning().get()!;

    mockGetAllCutoffUnmetItems.mockResolvedValue([
      { id: 1, lastSearchTime: null },
      { id: 2, lastSearchTime: "2026-03-06T09:00:00.000Z" },
      { id: 3, lastSearchTime: "2026-03-06T10:00:00.000Z" },
      { id: 4, lastSearchTime: "2026-03-08T08:30:00.000Z" },
    ]);
    mockGetQualityProfiles.mockResolvedValue([{ id: 1, cutoff: 19, name: "Ultra HD", items: [], upgradeAllowed: true }]);
    mockGetDueQualitySearchRecords.mockReturnValue([
      { id: 1, lastSearchTime: null },
      { id: 2, lastSearchTime: "2026-03-06T09:00:00.000Z" },
    ]);

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-08T12:00:00.000Z"));

    const { runQualityChecks } = await import("./quality-check");
    await runQualityChecks(instance);

    expect(mockSyncQualitySnapshot).toHaveBeenCalledWith(
      instance.id,
      "radarr",
      expect.arrayContaining([{ id: 1, lastSearchTime: null }]),
      expect.arrayContaining([{ id: 1, cutoff: 19, name: "Ultra HD", items: [], upgradeAllowed: true }]),
    );
    expect(mockGetDueQualitySearchRecords).toHaveBeenCalledWith(
      instance.id,
      "radarr",
      expect.arrayContaining([{ id: 1, lastSearchTime: null }]),
      2,
      new Date("2026-03-08T12:00:00.000Z"),
      "oldest_search",
    );
    expect(mockRunExclusive).toHaveBeenCalledWith(
      instance.id,
      "quality-search",
      expect.any(Function),
    );
    expect(mockSearchForUpgrade).toHaveBeenCalledWith([1, 2]);
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        instanceId: instance.id,
        requestedCount: 2,
        requestedItems: [
          { id: 1, label: "Unknown movie" },
          { id: 2, label: "Unknown movie" },
        ],
      }),
      "Sending upgrade search requests",
    );
    expect(mockRecordQualitySearch).toHaveBeenCalledWith(
      instance.id,
      [1, 2],
      "automation",
      undefined,
    );
    const refreshed = testDb
      .select()
      .from(schema.instances)
      .where(eq(schema.instances.id, instance.id))
      .get();
    expect(refreshed?.lastQualityCheckAt).toBe("2026-03-08T12:00:00.000Z");
    expect(mockWriteAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "quality_checks",
      details: expect.objectContaining({
        belowCutoffCount: 4,
        dueCount: 2,
        maxPerRun: 2,
        strategy: "oldest_search",
      }),
    }));
  });

  it("records a run without triggering searches when nothing is due", async () => {
    const instance = testDb.insert(schema.instances).values({
      name: "Sonarr",
      type: "sonarr",
      baseUrl: "http://localhost:8989",
      apiKey: "secret",
      qualityCheckMaxItems: 5,
    }).returning().get()!;

    mockGetAllCutoffUnmetItems.mockResolvedValue([
      { id: 10, lastSearchTime: "2026-03-08T10:30:00.000Z" },
    ]);
    mockGetQualityProfiles.mockResolvedValue([]);
    mockGetDueQualitySearchRecords.mockReturnValue([]);

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-08T12:00:00.000Z"));

    const { runQualityChecks } = await import("./quality-check");
    await runQualityChecks(instance);

    expect(mockSyncQualitySnapshot).toHaveBeenCalledWith(instance.id, "sonarr", [{ id: 10, lastSearchTime: "2026-03-08T10:30:00.000Z" }], []);
    expect(mockGetDueQualitySearchRecords).toHaveBeenCalledWith(
      instance.id,
      "sonarr",
      [{ id: 10, lastSearchTime: "2026-03-08T10:30:00.000Z" }],
      5,
      new Date("2026-03-08T12:00:00.000Z"),
      "oldest_search",
    );
    expect(mockSearchForUpgrade).not.toHaveBeenCalled();
    const refreshed = testDb
      .select()
      .from(schema.instances)
      .where(eq(schema.instances.id, instance.id))
      .get();
    expect(refreshed?.lastQualityCheckAt).toBe("2026-03-08T12:00:00.000Z");
  });

  it("skips sending upgrade searches when another quality search is already running", async () => {
    const instance = testDb.insert(schema.instances).values({
      name: "Radarr",
      type: "radarr",
      baseUrl: "http://localhost:7878",
      apiKey: "secret",
      qualityCheckMaxItems: 2,
    }).returning().get()!;

    mockGetAllCutoffUnmetItems.mockResolvedValue([
      { id: 1, lastSearchTime: null },
    ]);
    mockGetQualityProfiles.mockResolvedValue([]);
    mockGetDueQualitySearchRecords.mockReturnValue([
      { id: 1, lastSearchTime: null },
    ]);
    mockRunExclusive.mockResolvedValue(false);

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-08T12:00:00.000Z"));

    const { runQualityChecks } = await import("./quality-check");
    await runQualityChecks(instance);

    expect(mockRunExclusive).toHaveBeenCalledWith(
      instance.id,
      "quality-search",
      expect.any(Function),
    );
    expect(mockSearchForUpgrade).not.toHaveBeenCalled();
    expect(mockRecordQualitySearch).not.toHaveBeenCalled();
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      {
        instanceId: instance.id,
        dueCount: 1,
      },
      "Skipping upgrade search requests because another quality search is already running",
    );
  });
});
