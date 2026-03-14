"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Server,
  RefreshCw,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  XCircle,
  Wrench,
  Eye,
  ArrowDown,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface LogEntry {
  id: number;
  instanceId: number | null;
  instanceName: string | null;
  instanceType: string | null;
  issueId: number | null;
  action: string;
  source: "user" | "system" | "automation";
  details: string | null;
  createdAt: string;
}

const actionConfig: Record<
  string,
  { label: string; icon: typeof Server; color: string; accent: string }
> = {
  queue_sync: {
    label: "Queue Synced",
    icon: RefreshCw,
    color: "text-cyan-200",
    accent: "bg-cyan-400",
  },
  queue_sync_failed: {
    label: "Queue Sync Failed",
    icon: XCircle,
    color: "text-rose-200",
    accent: "bg-rose-400",
  },
  issues_detected: {
    label: "Issues Detected",
    icon: AlertTriangle,
    color: "text-amber-200",
    accent: "bg-amber-400",
  },
  health_restored: {
    label: "Health Restored",
    icon: ShieldCheck,
    color: "text-emerald-200",
    accent: "bg-emerald-400",
  },
  health_degraded: {
    label: "Health Degraded",
    icon: ShieldAlert,
    color: "text-rose-200",
    accent: "bg-rose-400",
  },
  dismiss_issue: {
    label: "Issue Dismissed",
    icon: Eye,
    color: "text-slate-300",
    accent: "bg-slate-500",
  },
  execute_fix: {
    label: "Fix Executed",
    icon: Wrench,
    color: "text-violet-200",
    accent: "bg-violet-400",
  },
};

function getActionDisplay(action: string) {
  return (
    actionConfig[action] ?? {
      label: action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      icon: Server,
      color: "text-slate-300",
      accent: "bg-slate-500",
    }
  );
}

function formatTime(iso: string) {
  const d = new Date(iso + (iso.endsWith("Z") ? "" : "Z"));
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatDate(iso: string) {
  const d = new Date(iso + (iso.endsWith("Z") ? "" : "Z"));
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function parseDetails(details: string | null): Record<string, unknown> | null {
  if (!details) return null;
  try {
    return JSON.parse(details);
  } catch {
    return null;
  }
}

function DetailsSummary({ action, details }: { action: string; details: string | null }) {
  const parsed = parseDetails(details);
  if (!parsed) return null;

  if (action === "queue_sync" && parsed.recordCount !== undefined) {
    return (
      <span className="text-slate-500">
        {" "}
        / {parsed.recordCount as number} item{(parsed.recordCount as number) !== 1 ? "s" : ""} in queue
      </span>
    );
  }

  if (action === "issues_detected" && parsed.issueCount !== undefined) {
    const types = parsed.types as string[] | undefined;
    return (
      <span className="text-slate-500">
        {" "}
        / {parsed.issueCount as number} new issue{(parsed.issueCount as number) !== 1 ? "s" : ""}
        {types?.length ? ` (${types.join(", ")})` : ""}
      </span>
    );
  }

  if ((action === "queue_sync_failed" || action === "health_degraded") && parsed.error) {
    return (
      <span className="text-rose-300/80"> / {String(parsed.error)}</span>
    );
  }

  if (action === "health_restored" && parsed.previousStatus) {
    return (
      <span className="text-slate-500">
        {" "}
        / was {String(parsed.previousStatus)}
      </span>
    );
  }

  if (action === "dismiss_issue" && parsed.title) {
    return (
      <span className="text-slate-500"> / {String(parsed.title)}</span>
    );
  }

  if (action === "execute_fix" && parsed.action) {
    return (
      <span className="text-slate-500"> / {String(parsed.action)}</span>
    );
  }

  return null;
}

function LogRow({ entry }: { entry: LogEntry }) {
  const display = getActionDisplay(entry.action);
  const Icon = display.icon;

  return (
    <div className="app-table-row group flex items-start gap-3 px-4 py-3 transition-colors">
      <div className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full opacity-70", display.accent)} />

      <div className="flex w-[4.5rem] shrink-0 items-center gap-2 pt-0.5">
        <span className="font-mono text-xs text-slate-600">
          {formatTime(entry.createdAt)}
        </span>
      </div>

      <div className={cn("shrink-0 pt-0.5", display.color)}>
        <Icon className="h-3.5 w-3.5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {entry.instanceName ? (
            <Badge
              variant={entry.instanceType === "sonarr" ? "info" : "warning"}
              className="px-1.5 py-0 font-mono text-[10px]"
            >
              {entry.instanceName}
            </Badge>
          ) : (
            <Badge
              variant="default"
              className="px-1.5 py-0 font-mono text-[10px]"
            >
              system
            </Badge>
          )}

          <span className="text-sm text-slate-200">
            {display.label}
          </span>

          <DetailsSummary action={entry.action} details={entry.details} />
        </div>
      </div>

      <div className="shrink-0">
        <Badge
          variant="default"
          className={cn(
            "px-1.5 py-0 text-[10px]",
            entry.source === "user" && "border-cyan-300/15 bg-cyan-400/10 text-cyan-200",
            entry.source === "system" && "border-white/10 bg-white/6 text-slate-300",
            entry.source === "automation" && "border-violet-300/15 bg-violet-400/10 text-violet-200",
          )}
        >
          {entry.source}
        </Badge>
      </div>
    </div>
  );
}

export function ActivityLog() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [paused, setPaused] = useState(false);

  const { data, isLoading } = useQuery<LogEntry[]>({
    queryKey: ["logs"],
    queryFn: async () => {
      const res = await fetch("/api/logs?limit=200");
      if (!res.ok) throw new Error("Failed to fetch logs");
      const json = await res.json();
      return json.data ?? [];
    },
    refetchInterval: paused ? false : 5_000,
  });

  // Group entries by date
  const grouped = (data ?? []).reduce<Record<string, LogEntry[]>>(
    (acc, entry) => {
      const date = formatDate(entry.createdAt);
      if (!acc[date]) acc[date] = [];
      acc[date].push(entry);
      return acc;
    },
    {},
  );

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [data, autoScroll]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop } = scrollRef.current;
    setAutoScroll(scrollTop < 10);
  };

  if (isLoading) {
    return (
      <div className="app-panel flex items-center justify-center py-16">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="app-panel flex h-[calc(100vh-13rem)] min-h-[34rem] flex-col p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex items-center gap-2 text-xs",
              paused ? "text-slate-500" : "text-emerald-300",
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                paused ? "bg-slate-500" : "bg-emerald-300 animate-pulse",
              )}
            />
            {paused ? "Paused" : "Live"}
          </div>
          <span className="text-xs text-slate-600">
            {data?.length ?? 0} entries
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setPaused(!paused)}>
            {paused ? "Resume" : "Pause"}
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="app-panel-muted flex-1 overflow-y-auto rounded-[1.1rem]"
      >
        {!data?.length ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <RefreshCw className="mb-3 h-8 w-8 text-slate-700" />
            <p className="text-sm">No activity yet</p>
            <p className="mt-1 text-xs text-slate-600">
              Events will appear here as instances are polled
            </p>
          </div>
        ) : (
          Object.entries(grouped).map(([date, entries]) => (
            <div key={date}>
              <div className="sticky top-0 z-10 border-b border-white/10 bg-slate-950/88 px-4 py-1.5 backdrop-blur-sm">
                <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                  {date}
                </span>
              </div>
              {entries.map((entry) => (
                <LogRow key={entry.id} entry={entry} />
              ))}
            </div>
          ))
        )}
      </div>

      {!autoScroll && (
        <Button
          onClick={() => {
            setAutoScroll(true);
            scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
          }}
          className="fixed bottom-24 right-6 rounded-full pl-3 pr-4 text-xs md:bottom-8"
        >
          <ArrowDown className="h-3 w-3 rotate-180" />
          Back to top
        </Button>
      )}
    </div>
  );
}
