"use client";

import { useState, useEffect } from "react";
import { Timer, RefreshCw, Play } from "lucide-react";

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
  if (secondsLeft === null) return <span className="text-slate-500">Awaiting first run</span>;
  if (secondsLeft === 0) return <span className="text-cyan-300">Running...</span>;

  const minutes = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const display = minutes > 0
    ? `${minutes}m ${String(secs).padStart(2, "0")}s`
    : `${secs}s`;

  return <span className="text-slate-300">{display}</span>;
}

interface ScheduledJobsPanelProps {
  jobs: CronJob[];
}

export function ScheduledJobsPanel({ jobs }: ScheduledJobsPanelProps) {
  return (
    <section className="app-panel p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <Timer className="h-4 w-4 text-slate-400" />
        <h3 className="text-sm font-medium text-slate-300">Scheduled Jobs</h3>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {jobs.map((job) => (
          <div
            key={job.key}
            className="app-panel-muted flex flex-col gap-2 rounded-lg p-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {job.icon}
                <span className="text-sm font-medium text-slate-200">{job.name}</span>
              </div>
              {job.onRunNow ? (
                <button
                  onClick={job.onRunNow}
                  disabled={job.isRunDisabled}
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200 disabled:opacity-50"
                  title={job.isRunDisabled && !job.isRunning ? "This job is already running" : "Run now"}
                >
                  {job.isRunning ? (
                    <RefreshCw className="h-3 w-3 animate-spin" />
                  ) : (
                    <Play className="h-3 w-3" />
                  )}
                  {job.isRunning ? "Running" : "Run"}
                </button>
              ) : job.isRunning ? (
                <span className="flex items-center gap-1 px-1.5 py-0.5 text-xs text-slate-400">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  Running
                </span>
              ) : null}
            </div>

            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Interval</span>
                <span className="text-slate-300">{formatInterval(job.intervalSeconds)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Last run</span>
                <span className="text-slate-400">
                  {job.lastRunAt ? formatTimeAgo(job.lastRunAt) : "Never"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Next in</span>
                <Countdown
                  lastRunAt={job.lastRunAt}
                  intervalSeconds={job.intervalSeconds}
                  enabled={job.enabled}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
