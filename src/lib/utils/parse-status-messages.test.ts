import { describe, it, expect } from "vitest";
import { parseStatusMessages } from "./parse-status-messages";

describe("parseStatusMessages", () => {
  it("returns empty array for null input", () => {
    expect(parseStatusMessages(null)).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(parseStatusMessages("")).toEqual([]);
  });

  it("returns empty array for invalid JSON", () => {
    expect(parseStatusMessages("not json")).toEqual([]);
  });

  it("returns empty array for non-array JSON", () => {
    expect(parseStatusMessages('{"title": "test"}')).toEqual([]);
  });

  it("extracts titles and messages", () => {
    const input = JSON.stringify([
      { title: "Download stalled", messages: ["No connections available"] },
    ]);
    expect(parseStatusMessages(input)).toEqual([
      "Download stalled",
      "No connections available",
    ]);
  });

  it("filters out empty strings", () => {
    const input = JSON.stringify([
      { title: "", messages: ["A message"] },
      { messages: ["Another"] },
    ]);
    expect(parseStatusMessages(input)).toEqual(["A message", "Another"]);
  });

  it("handles messages with only title", () => {
    const input = JSON.stringify([{ title: "Just a title" }]);
    expect(parseStatusMessages(input)).toEqual(["Just a title"]);
  });

  it("handles multiple status messages", () => {
    const input = JSON.stringify([
      { title: "First", messages: ["msg1"] },
      { title: "Second", messages: ["msg2", "msg3"] },
    ]);
    expect(parseStatusMessages(input)).toEqual([
      "First", "msg1", "Second", "msg2", "msg3",
    ]);
  });
});
