import { describe, expect, it } from "vitest";
import type { CutoffUnmetRecord } from "./arr-client/types";
import { orderQualityCheckRecords } from "./quality-check-strategy";

function makeRecord(overrides: Partial<CutoffUnmetRecord> & Pick<CutoffUnmetRecord, "id">): CutoffUnmetRecord {
  return {
    id: overrides.id,
    title: `Item ${overrides.id}`,
    ...overrides,
  };
}

describe("orderQualityCheckRecords", () => {
  it("orders by oldest known search time first", () => {
    const records = [
      makeRecord({ id: 1, title: "Newest", lastSearchTime: "2026-03-08T10:00:00.000Z" }),
      makeRecord({ id: 2, title: "Oldest", lastSearchTime: "2026-03-06T10:00:00.000Z" }),
      makeRecord({ id: 3, title: "Never" }),
    ];

    expect(orderQualityCheckRecords(records, "oldest_search").map((record) => record.id)).toEqual([3, 2, 1]);
  });

  it("uses the newest known search time across Arr and local cache", () => {
    const records = [
      makeRecord({ id: 1, title: "Cache newer", lastSearchTime: "2026-03-06T10:00:00.000Z" }),
      makeRecord({ id: 2, title: "Arr newer", lastSearchTime: "2026-03-07T10:00:00.000Z" }),
    ];

    expect(orderQualityCheckRecords(records, "oldest_search", {
      lastSearchAtById: new Map([
        [1, "2026-03-08T10:00:00.000Z"],
        [2, "2026-03-06T09:00:00.000Z"],
      ]),
    }).map((record) => record.id)).toEqual([2, 1]);
  });

  it("orders by year ascending and descending", () => {
    const records = [
      makeRecord({ id: 1, title: "Middle", year: 2020 }),
      makeRecord({ id: 2, title: "Newest", year: 2024 }),
      makeRecord({ id: 3, title: "Oldest", year: 1999 }),
    ];

    expect(orderQualityCheckRecords(records, "year_asc").map((record) => record.id)).toEqual([3, 1, 2]);
    expect(orderQualityCheckRecords(records, "year_desc").map((record) => record.id)).toEqual([2, 1, 3]);
  });

  it("orders by lowest known quality first", () => {
    const records = [
      makeRecord({
        id: 1,
        title: "1080p",
        movieFile: {
          quality: {
            quality: { id: 4, name: "WEBDL-1080p", source: "webdl", resolution: 1080 },
            revision: { version: 1, real: 0, isRepack: false },
          },
        },
      }),
      makeRecord({
        id: 2,
        title: "720p",
        movieFile: {
          quality: {
            quality: { id: 3, name: "HDTV-720p", source: "hdtv", resolution: 720 },
            revision: { version: 1, real: 0, isRepack: false },
          },
        },
      }),
      makeRecord({ id: 3, title: "Missing" }),
    ];

    expect(orderQualityCheckRecords(records, "lowest_quality").map((record) => record.id)).toEqual([3, 2, 1]);
  });

  it("uses the provided random source for deterministic shuffles", () => {
    const records = [
      makeRecord({ id: 1 }),
      makeRecord({ id: 2 }),
      makeRecord({ id: 3 }),
      makeRecord({ id: 4 }),
    ];
    const sequence = [0.2, 0.8, 0.1];
    let index = 0;

    const shuffled = orderQualityCheckRecords(records, "random", {
      random: () => {
        const value = sequence[index] ?? 0;
        index += 1;
        return value;
      },
    });

    expect(shuffled.map((record) => record.id)).toEqual([2, 4, 3, 1]);
  });
});
