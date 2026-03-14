import type { QualityPageRecord } from "@/lib/services/quality-service";

export interface NormalizedRow {
  id: number;
  title: string;
  subtitle: string;
  qualityName: string;
  wantedQualityName: string | null;
  lastCheckAt: string | null;
  nextCheckAt: string | null;
  upgradeSearchCount: number;
  lastUpgradeSearchAt: string | null;
}

export const STAT_SEGMENTS = [
  { key: "healthy", label: "In sync", countKey: "healthy", dotClassName: "bg-emerald-300" },
  { key: "wrongQuality", label: "Wrong quality", countKey: "wrongQuality", dotClassName: "bg-amber-300" },
  { key: "missing", label: "Missing", countKey: "missing", dotClassName: "bg-rose-300" },
] as const;

export function normalizeRecord(record: QualityPageRecord, type: string): NormalizedRow {
  if (type === "radarr") {
    return {
      id: record.id,
      title: record.title ?? "Unknown",
      subtitle: record.year ? String(record.year) : "",
      qualityName: record.movieFile?.quality?.quality?.name ?? "Unknown",
      wantedQualityName: record.wantedQualityName,
      lastCheckAt: record.lastCheckAt,
      nextCheckAt: record.nextCheckAt,
      upgradeSearchCount: record.upgradeSearchCount,
      lastUpgradeSearchAt: record.lastUpgradeSearchAt,
    };
  }

  const seriesTitle = record.series?.title ?? "Unknown";
  const ep = record.episode;
  const subtitle = ep
    ? `S${String(ep.seasonNumber).padStart(2, "0")}E${String(ep.episodeNumber).padStart(2, "0")} — ${ep.title}`
    : "";

  return {
    id: record.id,
    title: seriesTitle,
    subtitle,
    qualityName: record.episodeFile?.quality?.quality?.name ?? "Unknown",
    wantedQualityName: record.wantedQualityName,
    lastCheckAt: record.lastCheckAt,
    nextCheckAt: record.nextCheckAt,
    upgradeSearchCount: record.upgradeSearchCount,
    lastUpgradeSearchAt: record.lastUpgradeSearchAt,
  };
}

export function formatTimestamp(value: string | null, fallback = "Never"): string {
  if (!value) return fallback;

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return "Unknown";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

export function formatNextCheck(value: string | null): string {
  if (!value) return "Due now";

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return "Unknown";
  if (timestamp <= Date.now()) return "Due now";

  return formatTimestamp(value);
}

export function formatSearchSource(source: "user" | "automation"): string {
  return source === "user" ? "Manual" : "Scheduled";
}
