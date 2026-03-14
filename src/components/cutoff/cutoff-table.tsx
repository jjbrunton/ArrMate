"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import type { QualityPageResponse } from "@/lib/services/quality-service";
import { QualityStatBar } from "./quality-stat-bar";
import { CutoffDataTable } from "./cutoff-data-table";
import { RecentSearchActivity } from "./recent-search-activity";
import { normalizeRecord } from "./utils";

interface CutoffTableProps {
  instanceId: number;
  instanceType: string;
  enabled?: boolean;
}

interface QualitySearchResponse {
  sent: boolean;
  searchedIds: number[];
  skippedIds: number[];
  cutoffMetIds: number[];
  command: unknown;
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

      const skipReasons: string[] = [];
      if (result.cutoffMetIds.length > 0) {
        skipReasons.push(`${result.cutoffMetIds.length} no longer need${result.cutoffMetIds.length === 1 ? "s" : ""} an upgrade`);
      }
      if (result.skippedIds.length > 0) {
        skipReasons.push(`${result.skippedIds.length} searched in the last 24 hours`);
      }

      if (!result.sent) {
        toast({
          title: "No upgrade search issued",
          description: skipReasons.length > 0
            ? `Skipped: ${skipReasons.join(", ")}.`
            : "All selected items were recently searched.",
        });
        return;
      }

      toast({
        title: `Upgrade search triggered for ${result.searchedIds.length} item${result.searchedIds.length === 1 ? "" : "s"}`,
        description: skipReasons.length > 0
          ? `Skipped: ${skipReasons.join(", ")}.`
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
    <div className="space-y-5">
      <QualityStatBar
        statusSummary={data.statusSummary}
        totalBelowCutoff={data.totalRecords}
        upgradeHistory={data.upgradeHistory}
      />

      <div className="app-panel p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-400">
            {data.totalRecords} item{data.totalRecords !== 1 ? "s" : ""} below cutoff
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

        <CutoffDataTable
          rows={rows}
          instanceType={instanceType}
          selected={selected}
          onToggleAll={toggleAll}
          onToggleOne={toggleOne}
          allOnPageSelected={allOnPageSelected}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      </div>

      <RecentSearchActivity searches={data.recentSearches} />
    </div>
  );
}
