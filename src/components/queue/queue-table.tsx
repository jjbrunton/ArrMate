"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Spinner } from "@/components/ui/spinner";
import { parseStatusMessages } from "@/lib/utils/parse-status-messages";

interface QueueTableProps {
  instanceId: number;
}

interface QueueItemRow {
  id: number;
  externalId: number;
  title: string;
  status: string | null;
  trackedDownloadState: string | null;
  trackedDownloadStatus: string | null;
  statusMessages: string | null;
  sizeBytes: number | null;
  sizeLeftBytes: number | null;
  timeleft: string | null;
  downloadClient: string | null;
  protocol: string | null;
  isGone: boolean;
}

const PAGE_SIZE = 25;

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function statusVariant(state: string | null, downloadStatus: string | null): "success" | "warning" | "critical" | "info" | "default" {
  // If the *arr reports a warning/error status, reflect that regardless of download state
  if (downloadStatus?.toLowerCase() === "warning") return "warning";

  switch (state?.toLowerCase()) {
    case "downloading":
      return "info";
    case "completed":
    case "imported":
      return "success";
    case "failed":
    case "failedpending":
      return "critical";
    case "importblocked":
      return "critical";
    case "importpending":
    case "paused":
      return "warning";
    default:
      return "default";
  }
}

function displayState(state: string | null): string {
  switch (state?.toLowerCase()) {
    case "importblocked":
      return "Import Blocked";
    case "importpending":
      return "Import Pending";
    case "failedpending":
      return "Failed";
    default:
      return state || "unknown";
  }
}

export function QueueTable({ instanceId }: QueueTableProps) {
  const [page, setPage] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["queue", instanceId],
    queryFn: async () => {
      const res = await fetch(`/api/queue?instanceId=${instanceId}`);
      if (!res.ok) throw new Error("Failed to fetch queue");
      const json = await res.json();
      return (json.data ?? []) as QueueItemRow[];
    },
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (!data?.length) {
    return (
      <div className="app-empty-state flex flex-col items-center gap-2 py-12 text-center">
        <p className="text-sm font-medium text-slate-300">Queue is empty</p>
        <p className="text-xs text-slate-500">Items will appear here when downloads are active.</p>
      </div>
    );
  }

  const totalPages = Math.ceil(data.length / PAGE_SIZE);
  const paged = data.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="sticky top-0 z-10 border-b border-white/10 bg-slate-950/90 text-left text-xs text-slate-500 backdrop-blur-sm">
              <th className="pb-3 pr-4 pt-1 font-medium uppercase tracking-[0.14em]">Title</th>
              <th className="pb-3 pr-4 pt-1 font-medium uppercase tracking-[0.14em]">Status</th>
              <th className="pb-3 pr-4 pt-1 font-medium uppercase tracking-[0.14em]">Progress</th>
              <th className="pb-3 pr-4 pt-1 font-medium uppercase tracking-[0.14em]">Size</th>
              <th className="pb-3 pr-4 pt-1 font-medium uppercase tracking-[0.14em]">ETA</th>
              <th className="pb-3 pt-1 font-medium uppercase tracking-[0.14em]">Client</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((item) => {
              const progress =
                item.sizeBytes && item.sizeBytes > 0
                  ? ((item.sizeBytes - (item.sizeLeftBytes || 0)) / item.sizeBytes) * 100
                  : 0;
              const state = item.trackedDownloadState || item.status;
              const messages = parseStatusMessages(item.statusMessages);

              return (
                <tr key={item.id} className="app-table-row">
                  <td className="max-w-xs py-3 pr-4">
                    <div className="truncate text-slate-100">{item.title}</div>
                    {messages.length > 0 && (
                      <div className="mt-1 line-clamp-2 text-xs text-amber-200/85">
                        {messages.join(" / ")}
                      </div>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <Badge variant={statusVariant(state, item.trackedDownloadStatus)}>
                      {displayState(state)}
                    </Badge>
                  </td>
                  <td className="w-32 py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <ProgressBar value={progress} className="w-20" />
                      <span className="text-xs text-slate-400">{Math.round(progress)}%</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-slate-400">
                    {item.sizeBytes ? formatBytes(item.sizeBytes) : "—"}
                  </td>
                  <td className="py-3 pr-4 text-slate-400">{item.timeleft || "—"}</td>
                  <td className="py-3 text-slate-400">{item.downloadClient || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-white/8 px-1 pt-3">
          <p className="text-xs text-slate-500">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, data.length)} of {data.length} items
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Prev
            </Button>
            <span className="px-2 text-xs text-slate-400">
              {page + 1} / {totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
