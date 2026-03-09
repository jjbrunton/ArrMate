import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getAppVersionInfo = vi.fn();

vi.mock("@/lib/app/version", () => ({
  getAppVersionInfo,
}));

describe("update-service", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getAppVersionInfo.mockReturnValue({
      currentVersion: "0.1.0",
      currentCommitSha: "abcdef123456",
      releaseRepository: "jjbrunton/ArrMate",
    });
  });

  afterEach(async () => {
    global.fetch = originalFetch;
    const { resetAppUpdateStatusCacheForTests } = await import("./update-service");
    resetAppUpdateStatusCacheForTests();
  });

  it("reports when a newer release is available", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: "v0.2.0",
        html_url: "https://github.com/jjbrunton/ArrMate/releases/tag/v0.2.0",
        body: "Added a better update notifier.",
        published_at: "2026-03-08T12:00:00.000Z",
      }),
    }) as typeof fetch;

    const { getAppUpdateStatus } = await import("./update-service");
    const status = await getAppUpdateStatus(new Date("2026-03-09T10:00:00.000Z"));

    expect(status).toMatchObject({
      currentVersion: "0.1.0",
      currentCommitSha: "abcdef123456",
      latestVersion: "0.2.0",
      latestReleaseTag: "v0.2.0",
      updateAvailable: true,
      releaseUrl: "https://github.com/jjbrunton/ArrMate/releases/tag/v0.2.0",
      changelog: "Added a better update notifier.",
      error: null,
    });
  });

  it("reports up to date when the latest release matches the running version", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: "v0.1.0",
        html_url: "https://github.com/jjbrunton/ArrMate/releases/tag/v0.1.0",
        body: "",
        published_at: "2026-03-08T12:00:00.000Z",
      }),
    }) as typeof fetch;

    const { getAppUpdateStatus } = await import("./update-service");
    const status = await getAppUpdateStatus(new Date("2026-03-09T10:00:00.000Z"));

    expect(status).toMatchObject({
      latestVersion: "0.1.0",
      updateAvailable: false,
      changelog: null,
      error: null,
    });
  });

  it("returns a non-fatal error when the GitHub lookup fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    }) as typeof fetch;

    const { getAppUpdateStatus } = await import("./update-service");
    const status = await getAppUpdateStatus(new Date("2026-03-09T10:00:00.000Z"));

    expect(status).toMatchObject({
      latestVersion: null,
      updateAvailable: false,
      error: "Unable to check GitHub releases right now.",
    });
  });

  it("caches the GitHub response for the ttl window", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: "v0.2.0",
        html_url: "https://github.com/jjbrunton/ArrMate/releases/tag/v0.2.0",
        body: "Added a better update notifier.",
        published_at: "2026-03-08T12:00:00.000Z",
      }),
    }) as typeof fetch;

    const { getAppUpdateStatus } = await import("./update-service");

    await getAppUpdateStatus(new Date("2026-03-09T10:00:00.000Z"));
    await getAppUpdateStatus(new Date("2026-03-09T10:30:00.000Z"));

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
