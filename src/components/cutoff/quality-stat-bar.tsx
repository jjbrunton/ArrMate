import type { QualityStatusSummary, QualityUpgradeHistorySummary } from "@/lib/services/quality-service";
import { STAT_SEGMENTS, formatTimestamp } from "./utils";

interface QualityStatBarProps {
  statusSummary: QualityStatusSummary;
  totalBelowCutoff: number;
  upgradeHistory: QualityUpgradeHistorySummary;
}

export function QualityStatBar({ statusSummary, totalBelowCutoff, upgradeHistory }: QualityStatBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
      {STAT_SEGMENTS.map((segment) => (
        <div key={segment.key} className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${segment.dotClassName}`} />
          <span className="text-slate-400">{segment.label}</span>
          <strong className="text-white">{statusSummary[segment.countKey]}</strong>
        </div>
      ))}
      <span className="hidden text-slate-600 sm:inline">|</span>
      <div className="flex items-center gap-1.5">
        <span className="text-slate-400">Below cutoff</span>
        <strong className="text-white">{totalBelowCutoff}</strong>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-slate-400">Searches sent</span>
        <strong className="text-white">{upgradeHistory.totalItemsSent}</strong>
        <span className="text-xs text-slate-500">
          (last {formatTimestamp(upgradeHistory.lastSearchSentAt, "never").toLowerCase()})
        </span>
      </div>
    </div>
  );
}
