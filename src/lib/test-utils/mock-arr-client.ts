import { vi } from "vitest";

export function createMockArrClient() {
  return {
    testConnection: vi.fn().mockResolvedValue({ appName: "Radarr", version: "5.0", urlBase: "" }),
    getHealth: vi.fn().mockResolvedValue([]),
    getQueue: vi.fn().mockResolvedValue({ page: 1, pageSize: 50, totalRecords: 0, records: [] }),
    getAllQueueItems: vi.fn().mockResolvedValue([]),
    removeQueueItem: vi.fn().mockResolvedValue(undefined),
    bulkRemoveQueueItems: vi.fn().mockResolvedValue(undefined),
    grabQueueItem: vi.fn().mockResolvedValue(undefined),
    getMovies: vi.fn().mockResolvedValue([]),
    getManualImport: vi.fn().mockResolvedValue([]),
    triggerManualImport: vi.fn().mockResolvedValue(undefined),
    getMovieHistory: vi.fn().mockResolvedValue([]),
    getHistoryByDownloadId: vi.fn().mockResolvedValue({ page: 1, pageSize: 10, totalRecords: 0, records: [] }),
    getCutoffUnmet: vi.fn().mockResolvedValue({ page: 1, pageSize: 20, totalRecords: 0, records: [] }),
    getAllCutoffUnmetItems: vi.fn().mockResolvedValue([]),
    getQualityProfiles: vi.fn().mockResolvedValue([]),
    getCommands: vi.fn().mockResolvedValue([]),
    getActiveSearchCommands: vi.fn().mockResolvedValue([]),
    searchForUpgrade: vi.fn().mockResolvedValue({ id: 1, name: "Test", commandName: "Test", status: "queued" }),
  };
}

export type MockArrClient = ReturnType<typeof createMockArrClient>;
