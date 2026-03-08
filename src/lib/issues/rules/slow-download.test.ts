import { describe, it, expect } from "vitest";
import { slowDownloadRule } from "./slow-download";
import { makeQueueItem, makeContext } from "../../test-utils/fixtures";

const ctx = makeContext();

describe("slowDownloadRule", () => {
  it("has correct name and priority", () => {
    expect(slowDownloadRule.name).toBe("slow_download");
    expect(slowDownloadRule.priority).toBe(30);
  });

  it("detects very slow download (>24h remaining)", () => {
    // 1GB total, only 10MB downloaded in 2 hours → ~200 hours remaining
    const item = makeQueueItem({
      sizeBytes: 1_000_000_000,
      sizeLeftBytes: 990_000_000,
      firstSeenAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    });
    const result = slowDownloadRule.analyze(item, ctx);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("slow_download");
    expect(result!.severity).toBe("info");
  });

  it("does NOT flag fast downloads", () => {
    // 1GB total, 900MB downloaded in 1 hour → ~6 min remaining
    const item = makeQueueItem({
      sizeBytes: 1_000_000_000,
      sizeLeftBytes: 100_000_000,
      firstSeenAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });
    expect(slowDownloadRule.analyze(item, ctx)).toBeNull();
  });

  it("does NOT flag downloads under 30 min old", () => {
    const item = makeQueueItem({
      sizeBytes: 1_000_000_000,
      sizeLeftBytes: 999_000_000,
      firstSeenAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    });
    expect(slowDownloadRule.analyze(item, ctx)).toBeNull();
  });

  it("returns null when sizeBytes is null", () => {
    const item = makeQueueItem({ sizeBytes: null });
    expect(slowDownloadRule.analyze(item, ctx)).toBeNull();
  });

  it("returns null when sizeLeftBytes is 0", () => {
    const item = makeQueueItem({
      sizeBytes: 1_000_000,
      sizeLeftBytes: 0,
      firstSeenAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    });
    expect(slowDownloadRule.analyze(item, ctx)).toBeNull();
  });

  it("returns null when no bytes downloaded", () => {
    const item = makeQueueItem({
      sizeBytes: 1_000_000,
      sizeLeftBytes: 1_000_000,
      firstSeenAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    });
    // When sizeBytes === sizeLeftBytes, downloaded is 0, bytesPerMs is 0
    // This would cause division by zero or Infinity, but the rule should handle it
    expect(slowDownloadRule.analyze(item, ctx)).toBeNull();
  });

  it("includes estimated hours in description", () => {
    const item = makeQueueItem({
      sizeBytes: 1_000_000_000,
      sizeLeftBytes: 990_000_000,
      firstSeenAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    });
    const result = slowDownloadRule.analyze(item, ctx)!;
    expect(result.description).toMatch(/\d+ more hours/);
  });
});
