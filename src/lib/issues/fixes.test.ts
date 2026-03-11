import { describe, it, expect } from "vitest";
import { executeFix } from "./fixes";
import { createMockArrClient } from "../test-utils/mock-arr-client";
import type { ArrClient } from "../arr-client/client";
import type { FixAction } from "./types";

describe("executeFix", () => {
  it("remove_and_blocklist: calls removeQueueItem with blocklist=true", async () => {
    const client = createMockArrClient();
    const result = await executeFix(client as unknown as ArrClient, 42, "remove_and_blocklist");
    expect(result.success).toBe(true);
    expect(client.removeQueueItem).toHaveBeenCalledWith(42, { removeFromClient: true, blocklist: true });
  });

  it("remove_keep_files: calls removeQueueItem without blocklist", async () => {
    const client = createMockArrClient();
    const result = await executeFix(client as unknown as ArrClient, 42, "remove_keep_files");
    expect(result.success).toBe(true);
    expect(client.removeQueueItem).toHaveBeenCalledWith(42, { removeFromClient: false, blocklist: false });
  });

  it("retry_download: calls removeQueueItem with removeFromClient=true", async () => {
    const client = createMockArrClient();
    const result = await executeFix(client as unknown as ArrClient, 42, "retry_download");
    expect(result.success).toBe(true);
    expect(client.removeQueueItem).toHaveBeenCalledWith(42, { removeFromClient: true, blocklist: false });
  });

  it("grab_release: calls grabQueueItem", async () => {
    const client = createMockArrClient();
    const result = await executeFix(client as unknown as ArrClient, 42, "grab_release");
    expect(result.success).toBe(true);
    expect(client.grabQueueItem).toHaveBeenCalledWith(42);
  });

  it("force_import: fails when queue item not found", async () => {
    const client = createMockArrClient();
    client.getAllQueueItems.mockResolvedValue([]);
    const result = await executeFix(client as unknown as ArrClient, 42, "force_import");
    expect(result.success).toBe(false);
    expect(result.message).toContain("no longer exists");
  });

  it("force_import: fails for non-movie queue items", async () => {
    const client = createMockArrClient();
    client.getAllQueueItems.mockResolvedValue([
      { id: 42, outputPath: "/downloads/show", series: { id: 1, title: "Test Show" } },
    ]);
    const result = await executeFix(client as unknown as ArrClient, 42, "force_import");
    expect(result.success).toBe(false);
    expect(result.message).toContain("only supported for Radarr");
  });

  it("force_import: fails when no output path", async () => {
    const client = createMockArrClient();
    client.getAllQueueItems.mockResolvedValue([
      { id: 42, movie: { id: 10, title: "Test Movie" } },
    ]);
    const result = await executeFix(client as unknown as ArrClient, 42, "force_import");
    expect(result.success).toBe(false);
    expect(result.message).toContain("no output path");
  });

  it("force_import: fails when no importable files", async () => {
    const client = createMockArrClient();
    client.getAllQueueItems.mockResolvedValue([
      { id: 42, outputPath: "/downloads/movie", movie: { id: 10, title: "Test Movie" } },
    ]);
    client.getManualImport.mockResolvedValue([]);
    const result = await executeFix(client as unknown as ArrClient, 42, "force_import");
    expect(result.success).toBe(false);
    expect(result.message).toContain("No importable files");
  });

  it("force_import: triggers import with correct params", async () => {
    const client = createMockArrClient();
    client.getAllQueueItems.mockResolvedValue([
      {
        id: 42,
        title: "Firestarter",
        outputPath: "/downloads/Firestarter.2022",
        movie: { id: 10, title: "Firestarter" },
        quality: { quality: { id: 4 } },
        languages: [{ id: 1 }],
        downloadId: "dl-abc",
      },
    ]);
    client.getManualImport.mockResolvedValue([
      { path: "/downloads/Firestarter.2022/Firestarter.mkv", quality: { quality: { id: 4 } }, languages: [{ id: 1 }] },
    ]);
    const result = await executeFix(client as unknown as ArrClient, 42, "force_import");
    expect(result.success).toBe(true);
    expect(result.message).toContain("Firestarter");
    expect(client.getManualImport).toHaveBeenCalledWith("/downloads/Firestarter.2022");
    expect(client.triggerManualImport).toHaveBeenCalledWith([
      expect.objectContaining({ movieId: 10, path: "/downloads/Firestarter.2022/Firestarter.mkv", downloadId: "dl-abc" }),
    ]);
  });

  it("select_movie_import: fails without movieId", async () => {
    const client = createMockArrClient();
    const result = await executeFix(client as unknown as ArrClient, 42, "select_movie_import", { title: "Test" });
    expect(result.success).toBe(false);
    expect(result.message).toContain("not in your library");
  });

  it("select_movie_import: fails when queue item not found", async () => {
    const client = createMockArrClient();
    client.getAllQueueItems.mockResolvedValue([]);
    const result = await executeFix(client as unknown as ArrClient, 42, "select_movie_import", { movieId: 1 });
    expect(result.success).toBe(false);
    expect(result.message).toContain("no longer exists");
  });

  it("select_movie_import: triggers import with correct params", async () => {
    const client = createMockArrClient();
    client.getAllQueueItems.mockResolvedValue([
      { id: 42, outputPath: "/downloads/movie", quality: { quality: { id: 4 } }, languages: [{ id: 1 }] },
    ]);
    client.getManualImport.mockResolvedValue([
      { path: "/downloads/movie/file.mkv", quality: { quality: { id: 4 } }, languages: [{ id: 1 }] },
    ]);
    const result = await executeFix(client as unknown as ArrClient, 42, "select_movie_import", {
      movieId: 10,
      title: "Test Movie",
      downloadId: "dl-1",
    });
    expect(result.success).toBe(true);
    expect(client.getManualImport).toHaveBeenCalledWith("/downloads/movie");
    expect(client.triggerManualImport).toHaveBeenCalledWith([
      expect.objectContaining({ movieId: 10, path: "/downloads/movie/file.mkv" }),
    ]);
  });

  it("select_movie_import: fails when no importable files", async () => {
    const client = createMockArrClient();
    client.getAllQueueItems.mockResolvedValue([
      { id: 42, outputPath: "/downloads/movie" },
    ]);
    client.getManualImport.mockResolvedValue([]);
    const result = await executeFix(client as unknown as ArrClient, 42, "select_movie_import", { movieId: 1 });
    expect(result.success).toBe(false);
    expect(result.message).toContain("No importable files");
  });

  it("returns failure for unknown action", async () => {
    const client = createMockArrClient();
    const result = await executeFix(client as unknown as ArrClient, 42, "nonexistent" as FixAction);
    expect(result.success).toBe(false);
    expect(result.message).toContain("Unknown");
  });
});
