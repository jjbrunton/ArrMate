"use client";

import { useQuery } from "@tanstack/react-query";
import { Bot, Film, Search, Tv, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils/cn";

interface MediaManagementLogEntry {
  id: number;
  instanceId: number | null;
  instanceName: string | null;
  instanceType: "sonarr" | "radarr" | "overseerr" | null;
  issueId: number | null;
  action: string;
  source: "user" | "system" | "automation";
  details: string | null;
  createdAt: string;
}

interface ParsedMediaManagementDetails {
  requestedCount: number;
  commandName: string | null;
  commandStatus: string | null;
}

function parseDetails(details: string | null): ParsedMediaManagementDetails {
  if (!details) {
    return {
      requestedCount: 0,
      commandName: null,
      commandStatus: null,
    };
  }

  try {
    const parsed = JSON.parse(details) as {
      requestedCount?: unknown;
      commandName?: unknown;
      commandStatus?: unknown;
    };

    return {
      requestedCount: typeof parsed.requestedCount === "number" ? parsed.requestedCount : 0,
      commandName: typeof parsed.commandName === "string" ? parsed.commandName : null,
      commandStatus: typeof parsed.commandStatus === "string" ? parsed.commandStatus : null,
    };
  } catch {
    return {
      requestedCount: 0,
      commandName: null,
      commandStatus: null,
    };
  }
}

function formatCommandName(commandName: string | null): string {
  if (!commandName) return "Upgrade Search";

  return commandName
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ");
}

function formatTimestamp(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return "Unknown time";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

export function RecentMediaManagementRequests() {
  const { data, isLoading } = useQuery({
    queryKey: ["logs", "media-management"],
    queryFn: async () => {
      const res = await fetch("/api/logs?limit=50&action=quality_search_sent");
      if (!res.ok) throw new Error("Failed to fetch media management requests");
      const json = await res.json();
      return (json.data ?? []) as MediaManagementLogEntry[];
    },
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Spinner />
      </div>
    );
  }

  if (!data?.length) {
    return (
      <div className="app-empty-state py-10 text-center">
        <p className="text-sm font-medium text-slate-200">No media management requests yet</p>
        <p className="mt-2 text-sm text-slate-500">
          Upgrade-search activity will appear here after ArrMate sends commands to Sonarr or Radarr.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-slate-400">
          Latest {Math.min(data.length, 50)} request{data.length === 1 ? "" : "s"} across all Arr instances.
        </p>
        <Badge variant="default" className="border-white/10 bg-white/6 text-slate-300">
          50 loaded max
        </Badge>
      </div>

      <div className="app-panel-muted max-h-[38rem] overflow-y-auto rounded-[1.1rem]">
        <div className="divide-y divide-white/8">
          {data.map((entry) => {
            const details = parseDetails(entry.details);
            const TypeIcon = entry.instanceType === "sonarr" ? Tv : Film;
            const SourceIcon = entry.source === "automation" ? Bot : User;

            return (
              <div
                key={entry.id}
                className="flex items-start justify-between gap-4 px-4 py-3.5"
              >
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={entry.instanceType === "sonarr" ? "info" : "warning"}
                      className="gap-1 border-white/10"
                    >
                      <TypeIcon className="h-3 w-3" />
                      <span className="truncate">{entry.instanceName ?? "Unknown instance"}</span>
                    </Badge>
                    <Badge
                      variant="default"
                      className={cn(
                        "gap-1 border-white/10",
                        entry.source === "automation"
                          ? "bg-violet-400/10 text-violet-200"
                          : "bg-cyan-400/10 text-cyan-200",
                      )}
                    >
                      <SourceIcon className="h-3 w-3" />
                      {entry.source === "automation" ? "Scheduled" : "Manual"}
                    </Badge>
                    {details.commandStatus ? (
                      <Badge variant="default" className="border-white/10 bg-white/6 text-slate-300">
                        {details.commandStatus}
                      </Badge>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-sm text-slate-200">
                    <Search className="h-3.5 w-3.5 text-cyan-300" />
                    <span className="font-medium">{formatCommandName(details.commandName)}</span>
                    <span className="text-slate-500">·</span>
                    <span>
                      {details.requestedCount} item{details.requestedCount === 1 ? "" : "s"} requested
                    </span>
                  </div>
                </div>

                <div className="shrink-0 text-right text-xs text-slate-500">
                  <p className="font-mono tabular-nums text-slate-400">{formatTimestamp(entry.createdAt)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
