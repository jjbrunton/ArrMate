"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import type { QualityPageRecord, QualityPageResponse } from "@/lib/services/quality-service";

interface CutoffTableProps {
  instanceId: number;
  instanceType: string;
  enabled?: boolean;
}

interface NormalizedRow {
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

interface QualitySearchResponse {
  sent: boolean;
  searchedIds: number[];
  skippedIds: number[];
  command: unknown;
}

function formatSearchSource(source: "user" | "automation"): string {
  return source === "user" ? "Manual" : "Scheduled";
}

const CHART_SEGMENTS = [
  {
    key: "healthy",
    label: "In sync",
    countKey: "healthy",
    color: "#34d399",
    surfaceClassName: "border-emerald-300/15 bg-emerald-400/10",
    valueClassName: "text-emerald-100",
    dotClassName: "bg-emerald-300",
  },
  {
    key: "wrongQuality",
    label: "Wrong quality",
    countKey: "wrongQuality",
    color: "#f59e0b",
    surfaceClassName: "border-amber-300/15 bg-amber-400/10",
    valueClassName: "text-amber-100",
    dotClassName: "bg-amber-300",
  },
  {
    key: "missing",
    label: "Missing",
    countKey: "missing",
    color: "#f87171",
    surfaceClassName: "border-rose-300/15 bg-rose-400/10",
    valueClassName: "text-rose-100",
    dotClassName: "bg-rose-300",
  },
] as const;

function normalizeRecord(record: QualityPageRecord, type: string): NormalizedRow {
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

function formatTimestamp(value: string | null, fallback = "Never"): string {
  if (!value) return fallback;

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return "Unknown";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function formatNextCheck(value: string | null): string {
  if (!value) return "Due now";

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return "Unknown";
  if (timestamp <= Date.now()) return "Due now";

  return formatTimestamp(value);
}

function QualityStatusDonut({ data }: { data: QualityPageResponse["statusSummary"] }) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const total = data.trackedItems;
  let offset = 0;

  return (
    <div className="relative h-44 w-44 shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="rgba(148, 163, 184, 0.12)"
          strokeWidth="12"
        />
        {total > 0 && CHART_SEGMENTS.map((segment) => {
          const value = data[segment.countKey];
          if (value === 0) return null;

          const strokeLength = (value / total) * circumference;
          const circle = (
            <circle
              key={segment.key}
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={`${strokeLength} ${circumference}`}
              strokeDashoffset={-offset}
            />
          );
          offset += strokeLength;
          return circle;
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <p className="app-eyebrow">Tracked</p>
        <p className="text-4xl font-semibold text-white">{total}</p>
        <p className="text-xs text-slate-400">
          {total === 1 ? "item" : "items"}
        </p>
      </div>
    </div>
  );
}

export function CutoffTable({ instanceId, instanceType, enabled = true }: CutoffTableProps) {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const pageSize = 20;

  const { data, isLoading } = useQuery({
    queryKey: ["cutoff", instanceId, page],
    queryFn: async () => {
      const res = await fetch(`/api/instances/${instanceId}/cutoff?page=${page}&pageSize=${pageSize}`);
      if (!res.ok) throw new Error("Failed to fetch cutoff items");
      const json = await res.json();
      return json.data as QualityPageResponse;
    },
    enabled,
  });

  const searchMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await fetch(`/api/instances/${instanceId}/cutoff/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to trigger search");
      }

      const json = await res.json();
      return json.data as QualitySearchResponse;
    },
    onSuccess: async (result) => {
      setSelected(new Set());
      await queryClient.invalidateQueries({ queryKey: ["cutoff", instanceId] });

      if (!result.sent) {
        toast({
          title: "No upgrade search issued",
          description: "All selected items were searched within the last 24 hours.",
        });
        return;
      }

      toast({
        title: `Upgrade search triggered for ${result.searchedIds.length} item${result.searchedIds.length === 1 ? "" : "s"}`,
        description: result.skippedIds.length > 0
          ? `Skipped ${result.skippedIds.length} item${result.skippedIds.length === 1 ? "" : "s"} searched in the last 24 hours.`
          : undefined,
        variant: "success",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "error" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="app-empty-state py-12 text-center text-sm text-slate-500">
        Media management data is unavailable right now
      </div>
    );
  }

  const rows = data.records.map((record) => normalizeRecord(record, instanceType));
  const totalPages = Math.max(1, Math.ceil(data.totalRecords / pageSize));
  const allOnPageSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        rows.forEach((row) => next.delete(row.id));
      } else {
        rows.forEach((row) => next.add(row.id));
      }
      return next;
    });
  }

  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.9fr)]">
        <section className="app-panel-muted flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="app-eyebrow text-cyan-200">Library Status</p>
              <h3 className="text-xl font-semibold text-white">Media management overview</h3>
              <p className="text-sm text-slate-400">
                Counts come from the cached library for monitored media, combining wrong-quality and missing-file coverage from the latest local snapshot.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {CHART_SEGMENTS.map((segment) => (
                <div
                  key={segment.key}
                  className={`rounded-[1rem] border p-4 ${segment.surfaceClassName}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${segment.dotClassName}`} />
                    <p className="text-sm text-slate-300">{segment.label}</p>
                  </div>
                  <p className={`mt-3 text-3xl font-semibold ${segment.valueClassName}`}>
                    {data.statusSummary[segment.countKey]}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-center lg:justify-end">
            <QualityStatusDonut data={data.statusSummary} />
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <div className="app-panel-muted p-5">
            <p className="app-eyebrow text-cyan-200">Upgrade Searches</p>
            <p className="mt-2 text-4xl font-semibold text-white">{data.upgradeHistory.totalItemsSent}</p>
            <p className="mt-2 text-sm text-slate-400">
              item searches sent across {data.upgradeHistory.totalBatchesSent} batch{data.upgradeHistory.totalBatchesSent === 1 ? "" : "es"}
            </p>
            <p className="mt-4 text-xs text-slate-500">
              Last sent {formatTimestamp(data.upgradeHistory.lastSearchSentAt, "never")}
            </p>
          </div>

          <div className="app-panel-muted p-5">
            <p className="app-eyebrow text-cyan-200">Below Cutoff</p>
            <p className="mt-2 text-4xl font-semibold text-white">{data.totalRecords}</p>
            <p className="mt-2 text-sm text-slate-400">
              item{data.totalRecords === 1 ? "" : "s"} currently waiting for a better release
            </p>
            <p className="mt-4 text-xs text-slate-500">
              {data.statusSummary.trackedItems} tracked item{data.statusSummary.trackedItems === 1 ? "" : "s"} in media management
            </p>
          </div>
        </section>
      </div>

      <section className="app-panel-muted p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="app-eyebrow text-cyan-200">Recent Search Activity</p>
            <h3 className="mt-2 text-lg font-semibold text-white">What ArrMate asked Sonarr or Radarr to search</h3>
          </div>
          <p className="text-xs text-slate-500">
            Showing the latest {data.recentSearches.length} batch{data.recentSearches.length === 1 ? "" : "es"}
          </p>
        </div>

        {data.recentSearches.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">
            No upgrade searches have been sent for this instance yet.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {data.recentSearches.map((batch, index) => (
              <div key={`${batch.createdAt}-${index}`} className="rounded-2xl border border-white/8 bg-white/3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={batch.source === "user" ? "info" : "default"}>
                      {formatSearchSource(batch.source)}
                    </Badge>
                    <p className="text-sm text-slate-200">
                      {batch.requestedCount} item{batch.requestedCount === 1 ? "" : "s"} searched
                    </p>
                  </div>
                  <p className="text-xs text-slate-500">{formatTimestamp(batch.createdAt)}</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {batch.items.map((item) => (
                    <span
                      key={`${batch.createdAt}-${item.id}`}
                      className="rounded-full border border-cyan-400/20 bg-cyan-400/8 px-3 py-1 text-xs text-cyan-100"
                    >
                      {item.label}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-400">
            {data.totalRecords} item{data.totalRecords !== 1 ? "s" : ""} currently need media attention
          </p>
          {selected.size > 0 ? (
            <Button
              size="sm"
              onClick={() => searchMutation.mutate([...selected])}
              disabled={searchMutation.isPending}
            >
              <Search className="mr-1.5 h-3.5 w-3.5" />
              Search Upgrades ({selected.size})
            </Button>
          ) : null}
        </div>

        {data.totalRecords === 0 ? (
          <div className="app-empty-state py-12 text-center text-sm text-slate-500">
            All tracked items are either present on disk or already at the expected quality cutoff
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-xs text-slate-500">
                    <th className="pb-3 pr-4 font-medium">
                      <input
                        type="checkbox"
                        checked={allOnPageSelected}
                        onChange={toggleAll}
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
                          onChange={() => toggleOne(row.id)}
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
                  onClick={() => setPage((value) => value - 1)}
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
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
