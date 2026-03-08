import { describe, it, expect, vi, afterEach } from "vitest";
import { stalledRule } from "./stalled";
import { makeQueueItem, makeStatusMessages, makeContext } from "../../test-utils/fixtures";

const ctx = makeContext();

describe("stalledRule", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("has correct name and priority", () => {
    expect(stalledRule.name).toBe("stalled");
    expect(stalledRule.priority).toBe(90);
  });

  it("detects stalled keyword in status messages", () => {
    const item = makeQueueItem({
      statusMessages: makeStatusMessages(["Download is stalled - no seeders available"]),
    });
    const result = stalledRule.analyze(item, ctx);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("stalled");
    expect(result!.severity).toBe("warning");
  });

  it("detects 'no connections' keyword", () => {
    const item = makeQueueItem({
      statusMessages: makeStatusMessages(["No connections available"]),
    });
    expect(stalledRule.analyze(item, ctx)).not.toBeNull();
  });

  it("detects 'not seeded' keyword", () => {
    const item = makeQueueItem({
      statusMessages: makeStatusMessages(["Torrent is not seeded"]),
    });
    expect(stalledRule.analyze(item, ctx)).not.toBeNull();
  });

  it("detects 'unavailable' keyword", () => {
    const item = makeQueueItem({
      statusMessages: makeStatusMessages(["Release unavailable"]),
    });
    expect(stalledRule.analyze(item, ctx)).not.toBeNull();
  });

  it("detects no-progress stall (same size for 60+ min)", () => {
    const item = makeQueueItem({
      sizeBytes: 1_000_000,
      sizeLeftBytes: 1_000_000, // no progress
      firstSeenAt: new Date(Date.now() - 61 * 60 * 1000).toISOString(),
      statusMessages: null,
    });
    const result = stalledRule.analyze(item, ctx);
    expect(result).not.toBeNull();
    expect(result!.description).toContain("no progress");
  });

  it("does NOT flag no-progress under 60 min", () => {
    const item = makeQueueItem({
      sizeBytes: 1_000_000,
      sizeLeftBytes: 1_000_000,
      firstSeenAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      statusMessages: null,
    });
    expect(stalledRule.analyze(item, ctx)).toBeNull();
  });

  it("does NOT flag when progress has been made", () => {
    const item = makeQueueItem({
      sizeBytes: 1_000_000,
      sizeLeftBytes: 900_000, // some progress
      firstSeenAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
      statusMessages: null,
    });
    expect(stalledRule.analyze(item, ctx)).toBeNull();
  });

  it("returns null for normal downloading item", () => {
    const item = makeQueueItem({ statusMessages: null });
    expect(stalledRule.analyze(item, ctx)).toBeNull();
  });

  it("handles malformed status messages JSON", () => {
    const item = makeQueueItem({ statusMessages: "not valid json" });
    expect(stalledRule.analyze(item, ctx)).toBeNull();
  });

  it("suggests blocklist as first fix", () => {
    const item = makeQueueItem({
      statusMessages: makeStatusMessages(["Download is stalled"]),
    });
    const result = stalledRule.analyze(item, ctx)!;
    expect(result.suggestedFixes[0].action).toBe("remove_and_blocklist");
  });
});
