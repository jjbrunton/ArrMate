import { describe, it, expect } from "vitest";
import { missingFilesRule } from "./missing-files";
import { makeQueueItem, makeStatusMessages, makeContext } from "../../test-utils/fixtures";

const ctx = makeContext();

describe("missingFilesRule", () => {
  it("has correct name and priority", () => {
    expect(missingFilesRule.name).toBe("missing_files");
    expect(missingFilesRule.priority).toBe(70);
  });

  it("detects 'no files found'", () => {
    const item = makeQueueItem({
      statusMessages: makeStatusMessages(["No files found in download"]),
    });
    const result = missingFilesRule.analyze(item, ctx);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("missing_files");
    expect(result!.severity).toBe("critical");
  });

  it("detects 'no eligible files'", () => {
    const item = makeQueueItem({
      statusMessages: makeStatusMessages(["No eligible files found"]),
    });
    expect(missingFilesRule.analyze(item, ctx)).not.toBeNull();
  });

  it("detects 'no video files'", () => {
    const item = makeQueueItem({
      statusMessages: makeStatusMessages(["No video files found in download folder"]),
    });
    expect(missingFilesRule.analyze(item, ctx)).not.toBeNull();
  });

  it("detects 'sample only'", () => {
    const item = makeQueueItem({
      statusMessages: makeStatusMessages(["Sample only - no full video file"]),
    });
    expect(missingFilesRule.analyze(item, ctx)).not.toBeNull();
  });

  it("returns null for normal messages", () => {
    const item = makeQueueItem({
      statusMessages: makeStatusMessages(["Downloading"]),
    });
    expect(missingFilesRule.analyze(item, ctx)).toBeNull();
  });

  it("returns null for null", () => {
    const item = makeQueueItem({ statusMessages: null });
    expect(missingFilesRule.analyze(item, ctx)).toBeNull();
  });
});
