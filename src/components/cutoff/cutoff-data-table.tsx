import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type NormalizedRow, formatTimestamp, formatNextCheck } from "./utils";

interface CutoffDataTableProps {
  rows: NormalizedRow[];
  instanceType: string;
  selected: Set<number>;
  onToggleAll: () => void;
  onToggleOne: (id: number) => void;
  allOnPageSelected: boolean;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function CutoffDataTable({
  rows,
  instanceType,
  selected,
  onToggleAll,
  onToggleOne,
  allOnPageSelected,
  page,
  totalPages,
  onPageChange,
}: CutoffDataTableProps) {
  if (rows.length === 0) {
    return (
      <div className="app-empty-state py-12 text-center text-sm text-slate-500">
        All tracked items are either present on disk or already at the expected quality cutoff
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs text-slate-500">
              <th className="pb-3 pr-4 font-medium">
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={onToggleAll}
                  className="accent-cyan-400"
                  aria-label="Select all"
                />
              </th>
              <th className="pb-3 pr-4 font-medium uppercase tracking-[0.14em]">Title</th>
              <th className="pb-3 pr-4 font-medium uppercase tracking-[0.14em]">
                {instanceType === "radarr" ? "Year" : "Episode"}
              </th>
              <th className="pb-3 pr-4 font-medium uppercase tracking-[0.14em]">Current Quality</th>
              <th className="pb-3 pr-4 font-medium uppercase tracking-[0.14em]">Wanted Quality</th>
              <th className="pb-3 pr-4 font-medium uppercase tracking-[0.14em]">Upgrades Sent</th>
              <th className="pb-3 pr-4 font-medium uppercase tracking-[0.14em]">Last Check</th>
              <th className="pb-3 font-medium uppercase tracking-[0.14em]">Next Check</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="app-table-row">
                <td className="py-3 pr-4">
                  <input
                    type="checkbox"
                    checked={selected.has(row.id)}
                    onChange={() => onToggleOne(row.id)}
                    className="accent-cyan-400"
                    aria-label={`Select ${row.title}`}
                  />
                </td>
                <td className="py-3 pr-4 text-slate-100">{row.title}</td>
                <td className="py-3 pr-4 text-slate-400">{row.subtitle || "—"}</td>
                <td className="py-3 pr-4">
                  <Badge variant="warning">{row.qualityName}</Badge>
                </td>
                <td className="py-3 pr-4 text-slate-300">{row.wantedQualityName ?? "Unknown"}</td>
                <td className="py-3 pr-4">
                  <div className="space-y-1">
                    <p className="text-slate-100">{row.upgradeSearchCount}</p>
                    <p className="text-xs text-slate-500">
                      Last sent {formatTimestamp(row.lastUpgradeSearchAt, "never")}
                    </p>
                  </div>
                </td>
                <td className="py-3 pr-4 text-slate-400">{formatTimestamp(row.lastCheckAt)}</td>
                <td className="py-3 text-slate-400">{formatNextCheck(row.nextCheckAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-slate-400">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </>
  );
}
