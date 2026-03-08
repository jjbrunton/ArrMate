import { describe, it, expect } from "vitest";
import { duplicateRule } from "./duplicate";
import { makeQueueItem, makeStatusMessages, makeContext } from "../../test-utils/fixtures";

const ctx = makeContext();

describe("duplicateRule", () => {
  it("has correct name and priority", () => {
    expect(duplicateRule.name).toBe("duplicate");
    expect(duplicateRule.priority).toBe(80);
  });

  it("detects 'duplicate' keyword", () => {
    const item = makeQueueItem({
      statusMessages: makeStatusMessages(["This release has a duplicate in your library"]),
    });
    const result = duplicateRule.analyze(item, ctx);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("duplicate");
    expect(result!.severity).toBe("warning");
  });

  it("detects 'already exists' keyword", () => {
    const item = makeQueueItem({
      statusMessages: makeStatusMessages(["Movie file already exists on disk"]),
    });
    expect(duplicateRule.analyze(item, ctx)).not.toBeNull();
  });

  it("detects 'already been imported' keyword", () => {
    const item = makeQueueItem({
      statusMessages: makeStatusMessages(["Has already been imported"]),
    });
    expect(duplicateRule.analyze(item, ctx)).not.toBeNull();
  });

  it("returns null for non-duplicate messages", () => {
    const item = makeQueueItem({
      statusMessages: makeStatusMessages(["Download is progressing normally"]),
    });
    expect(duplicateRule.analyze(item, ctx)).toBeNull();
  });

  it("returns null for null status messages", () => {
    const item = makeQueueItem({ statusMessages: null });
    expect(duplicateRule.analyze(item, ctx)).toBeNull();
  });

  it("suggests remove_and_blocklist first", () => {
    const item = makeQueueItem({
      statusMessages: makeStatusMessages(["Duplicate detected"]),
    });
    const result = duplicateRule.analyze(item, ctx)!;
    expect(result.suggestedFixes[0].action).toBe("remove_and_blocklist");
    expect(result.suggestedFixes).toHaveLength(2);
  });
});
