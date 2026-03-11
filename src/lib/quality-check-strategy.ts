import type { CutoffUnmetRecord, QualityInfo } from "./arr-client/types";

export const QUALITY_CHECK_STRATEGY_VALUES = [
  "oldest_search",
  "random",
  "year_asc",
  "year_desc",
  "lowest_quality",
] as const;

export type QualityCheckStrategy = typeof QUALITY_CHECK_STRATEGY_VALUES[number];

export const DEFAULT_QUALITY_CHECK_STRATEGY: QualityCheckStrategy = "oldest_search";

export const QUALITY_CHECK_STRATEGY_OPTIONS: Array<{
  value: QualityCheckStrategy;
  label: string;
  description: string;
}> = [
  {
    value: "oldest_search",
    label: "Oldest search first",
    description: "Prioritize items that have waited the longest since the last known search.",
  },
  {
    value: "random",
    label: "Random",
    description: "Shuffle eligible items each run to spread upgrade attempts around the library.",
  },
  {
    value: "year_asc",
    label: "Oldest year first",
    description: "Process older releases before newer ones.",
  },
  {
    value: "year_desc",
    label: "Newest year first",
    description: "Process newer releases before older ones.",
  },
  {
    value: "lowest_quality",
    label: "Lowest quality first",
    description: "Prioritize items with the lowest currently known file quality.",
  },
];

function getTimestamp(value: string | null | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
}

function getLatestKnownSearchTimestamp(record: CutoffUnmetRecord, lastSearchAtById: Map<number, string | null>): number {
  return Math.max(
    getTimestamp(record.lastSearchTime ?? null),
    getTimestamp(lastSearchAtById.get(record.id) ?? null),
  );
}

function getRecordYear(record: CutoffUnmetRecord): number | null {
  if (typeof record.year === "number") return record.year;
  if (typeof record.movie?.year === "number") return record.movie.year;
  return null;
}

function getRecordTitle(record: CutoffUnmetRecord): string {
  return record.title
    ?? record.movie?.title
    ?? record.series?.title
    ?? record.episode?.title
    ?? "";
}

function getRecordQuality(record: CutoffUnmetRecord): QualityInfo | undefined {
  return record.movieFile?.quality ?? record.episodeFile?.quality;
}

function getQualityRank(record: CutoffUnmetRecord): number {
  const quality = getRecordQuality(record);
  if (!quality) return -1;

  return (quality.quality.resolution * 1000) + quality.quality.id;
}

function compareFallback(a: CutoffUnmetRecord, b: CutoffUnmetRecord): number {
  const titleComparison = getRecordTitle(a).localeCompare(getRecordTitle(b));
  if (titleComparison !== 0) return titleComparison;
  return a.id - b.id;
}

function shuffleRecords(records: CutoffUnmetRecord[], random: () => number): CutoffUnmetRecord[] {
  const shuffled = [...records];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

export function orderQualityCheckRecords(
  records: CutoffUnmetRecord[],
  strategy: QualityCheckStrategy,
  options?: {
    lastSearchAtById?: Map<number, string | null>;
    random?: () => number;
  },
): CutoffUnmetRecord[] {
  const { lastSearchAtById = new Map<number, string | null>(), random = Math.random } = options ?? {};

  if (strategy === "random") {
    return shuffleRecords(records, random);
  }

  const ordered = [...records];

  ordered.sort((a, b) => {
    if (strategy === "oldest_search") {
      const lastSearchA = getLatestKnownSearchTimestamp(a, lastSearchAtById);
      const lastSearchB = getLatestKnownSearchTimestamp(b, lastSearchAtById);

      if (lastSearchA !== lastSearchB) {
        return lastSearchA - lastSearchB;
      }

      return compareFallback(a, b);
    }

    if (strategy === "year_asc" || strategy === "year_desc") {
      const yearA = getRecordYear(a);
      const yearB = getRecordYear(b);

      if (yearA === null && yearB !== null) return 1;
      if (yearA !== null && yearB === null) return -1;
      if (yearA !== null && yearB !== null && yearA !== yearB) {
        return strategy === "year_asc" ? yearA - yearB : yearB - yearA;
      }

      return compareFallback(a, b);
    }

    const qualityRankA = getQualityRank(a);
    const qualityRankB = getQualityRank(b);

    if (qualityRankA !== qualityRankB) {
      return qualityRankA - qualityRankB;
    }

    return compareFallback(a, b);
  });

  return ordered;
}
