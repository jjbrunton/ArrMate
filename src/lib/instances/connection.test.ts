import { beforeEach, describe, expect, it, vi } from "vitest";

const arrClientMock = vi.hoisted(() => ({
  testConnection: vi.fn(),
}));

const overseerrClientMock = vi.hoisted(() => ({
  testConnection: vi.fn(),
}));

vi.mock("../arr-client/client", () => ({
  ArrClient: vi.fn(function MockArrClient() {
    return arrClientMock;
  }),
}));

vi.mock("../overseerr-client/client", () => ({
  OverseerrClient: vi.fn(function MockOverseerrClient() {
    return overseerrClientMock;
  }),
}));

describe("verifyInstanceConnection", () => {
  beforeEach(() => {
    arrClientMock.testConnection.mockReset();
    overseerrClientMock.testConnection.mockReset();
  });

  it("uses the Arr client for Sonarr/Radarr instances", async () => {
    const { verifyInstanceConnection } = await import("./connection");

    arrClientMock.testConnection.mockResolvedValue({
      appName: "Radarr",
      version: "5.0.0",
      urlBase: "",
    });

    await expect(verifyInstanceConnection("radarr", "http://localhost:7878", "key")).resolves.toEqual({
      appName: "Radarr",
      version: "5.0.0",
    });
  });

  it("uses the Overseerr client for Overseerr instances", async () => {
    const { verifyInstanceConnection } = await import("./connection");

    overseerrClientMock.testConnection.mockResolvedValue({
      appName: "Overseerr",
      version: "1.0.0",
    });

    await expect(verifyInstanceConnection("overseerr", "http://localhost:5055", "key")).resolves.toEqual({
      appName: "Overseerr",
      version: "1.0.0",
    });
  });
});
