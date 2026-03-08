import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeInstance, resetIdCounter } from "../test-utils/fixtures";
import type { Instance } from "../db/schema";

const mocks = vi.hoisted(() => ({
  storedInstances: [] as Instance[],
  scheduleMock: vi.fn(() => ({
    stop: vi.fn(),
  })),
  pollQueueMock: vi.fn(async () => {}),
  checkInstanceHealthMock: vi.fn(async () => {}),
  syncMediaCacheMock: vi.fn(async () => {}),
  runQualityChecksMock: vi.fn(async () => {}),
  syncOverseerrRequestsMock: vi.fn(async () => []),
  runExclusiveMock: vi.fn(async (_instanceId: number, _jobType: string, fn: () => Promise<void>) => {
    await fn();
    return true;
  }),
}));

vi.mock("node-cron", () => ({
  schedule: mocks.scheduleMock,
}));

vi.mock("../db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        all: () => mocks.storedInstances,
      }),
    }),
  }),
}));

vi.mock("./jobs/poll-queue", () => ({
  pollQueue: mocks.pollQueueMock,
}));

vi.mock("./jobs/health-check", () => ({
  checkInstanceHealth: mocks.checkInstanceHealthMock,
}));

vi.mock("./jobs/sync-media-cache", () => ({
  syncMediaCache: mocks.syncMediaCacheMock,
}));

vi.mock("./jobs/quality-check", () => ({
  runQualityChecks: mocks.runQualityChecksMock,
}));

vi.mock("./job-tracker", () => ({
  runExclusive: mocks.runExclusiveMock,
}));

vi.mock("../services/request-service", () => ({
  syncOverseerrRequests: mocks.syncOverseerrRequestsMock,
}));

vi.mock("../utils/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
  }),
}));

describe("scheduler", () => {
  beforeEach(() => {
    vi.resetModules();
    resetIdCounter();
    mocks.storedInstances = [];
    mocks.scheduleMock.mockClear();
    mocks.pollQueueMock.mockClear();
    mocks.checkInstanceHealthMock.mockClear();
    mocks.syncMediaCacheMock.mockClear();
    mocks.runQualityChecksMock.mockClear();
    mocks.syncOverseerrRequestsMock.mockClear();
    mocks.runExclusiveMock.mockClear();
  });

  it("schedules a new Arr instance immediately and primes all of its jobs once", async () => {
    const instance = makeInstance({ id: 11, type: "radarr" });
    mocks.storedInstances = [instance];

    const { scheduleNewInstance } = await import("./index");

    await scheduleNewInstance(instance.id);

    expect(mocks.scheduleMock).toHaveBeenCalledTimes(4);
    expect(mocks.runExclusiveMock).toHaveBeenCalledTimes(4);
    expect(mocks.runExclusiveMock.mock.calls.map((call) => call[1]).sort()).toEqual([
      "health-check",
      "poll",
      "quality-check",
      "sync-media",
    ]);
    expect(mocks.checkInstanceHealthMock).toHaveBeenCalledWith(instance.id);
    expect(mocks.pollQueueMock).toHaveBeenCalledWith(instance);
    expect(mocks.runQualityChecksMock).toHaveBeenCalledWith(instance);
    expect(mocks.syncMediaCacheMock).toHaveBeenCalledWith(instance);
  });

  it("schedules a new Overseerr instance immediately and primes request sync once", async () => {
    const instance = makeInstance({ id: 22, type: "overseerr", baseUrl: "http://localhost:5055" });
    mocks.storedInstances = [instance];

    const { scheduleNewInstance } = await import("./index");

    await scheduleNewInstance(instance.id);

    expect(mocks.scheduleMock).toHaveBeenCalledTimes(2);
    expect(mocks.runExclusiveMock).toHaveBeenCalledTimes(2);
    expect(mocks.runExclusiveMock.mock.calls.map((call) => call[1]).sort()).toEqual([
      "health-check",
      "sync-requests",
    ]);
    expect(mocks.checkInstanceHealthMock).toHaveBeenCalledWith(instance.id);
    expect(mocks.syncOverseerrRequestsMock).toHaveBeenCalledWith(instance);
  });

  it("does not prime existing instances when the scheduler starts", async () => {
    mocks.storedInstances = [makeInstance({ id: 33, type: "sonarr", baseUrl: "http://localhost:8989" })];

    const { startScheduler, stopScheduler } = await import("./index");

    startScheduler();

    expect(mocks.scheduleMock).toHaveBeenCalledTimes(5);
    expect(mocks.runExclusiveMock).not.toHaveBeenCalled();
    expect(mocks.checkInstanceHealthMock).not.toHaveBeenCalled();
    expect(mocks.pollQueueMock).not.toHaveBeenCalled();
    expect(mocks.runQualityChecksMock).not.toHaveBeenCalled();
    expect(mocks.syncMediaCacheMock).not.toHaveBeenCalled();
    expect(mocks.syncOverseerrRequestsMock).not.toHaveBeenCalled();

    stopScheduler();
  });
});
