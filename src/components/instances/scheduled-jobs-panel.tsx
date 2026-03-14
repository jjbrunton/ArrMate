"use client";

import { useState, useEffect } from "react";
import { RefreshCw, Play } from "lucide-react";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";

interface CronJob {
  key: string;
  name: string;
  icon: React.ReactNode;
  intervalSeconds: number;
  lastRunAt: string | null;
  enabled: boolean;
  onRunNow?: () => void;
  isRunning?: boolean;
  isRunDisabled?: boolean;
}

function formatInterval(seconds: number): string {
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const m = Math.round(seconds / 60);
  return `${m}m`;
}

function formatTimeAgo(iso: string): string {
  const diff = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function Countdown({ lastRunAt, intervalSeconds, enabled }: {
  lastRunAt: string | null;
  intervalSeconds: number;
  enabled: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled || !lastRunAt) return;

    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [lastRunAt, intervalSeconds, enabled]);

  const secondsLeft =
    enabled && lastRunAt
      ? Math.max(
          0,
          Math.round(
            (new Date(lastRunAt).getTime() + intervalSeconds * 1000 - now) / 1000,
          ),
        )
      : null;

  if (!enabled) return <span className="text-slate-500">Paused</span>;
  if (secondsLeft === null) return <span className="text-slate-500">Waiting</span>;
  if (secondsLeft === 0) return <span className="text-cyan-300">Now</span>;

  const minutes = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const display = minutes > 0
    ? `${minutes}m ${String(secs).padStart(2, "0")}s`
    : `${secs}s`;

  return <span>{display}</span>;
}

interface ScheduledJobsPanelProps {
  jobs: CronJob[];
}

export function ScheduledJobsPanel({ jobs }: ScheduledJobsPanelProps) {
  return (
    <TooltipProvider>
      <div className="flex flex-wrap gap-2">
        {jobs.map((job) => (
          <Tooltip
            key={job.key}
            content={
              <div className="space-y-1">
                <p className="font-medium text-slate-200">{job.name}</p>
                <p>Interval: {formatInterval(job.intervalSeconds)}</p>
                <p>Last run: {job.lastRunAt ? formatTimeAgo(job.lastRunAt) : "Never"}</p>
              </div>
            }
          >
            <div className="app-panel-muted flex items-center gap-2 rounded-full px-3 py-1.5 text-xs">
              {job.icon}
              <span className="font-medium text-slate-300">{job.name}</span>
              <span className="text-slate-500">·</span>
              <span className="tabular-nums text-slate-400">
                <Countdown
                  lastRunAt={job.lastRunAt}
                  intervalSeconds={job.intervalSeconds}
                  enabled={job.enabled}
                />
              </span>
              {job.onRunNow ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    job.onRunNow?.();
                  }}
                  disabled={job.isRunDisabled}
                  className="ml-0.5 rounded-full p-0.5 text-slate-500 transition-colors hover:bg-white/8 hover:text-slate-200 disabled:opacity-50"
                  aria-label={`Run ${job.name}`}
                >
                  {job.isRunning ? (
                    <RefreshCw className="h-3 w-3 animate-spin" />
                  ) : (
                    <Play className="h-3 w-3" />
                  )}
                </button>
              ) : job.isRunning ? (
                <RefreshCw className="ml-0.5 h-3 w-3 animate-spin text-slate-500" />
              ) : null}
            </div>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}
