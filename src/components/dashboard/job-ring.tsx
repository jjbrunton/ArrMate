import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type JobType = "poll" | "sync-media" | "health-check" | "sync-requests" | "quality-check";

export interface JobDefinition {
  key: JobType;
  label: string;
  intervalSeconds: number;
  lastRunAt: string | null;
  icon: LucideIcon;
  textClass: string;
  surfaceClass: string;
}

export function formatDuration(seconds: number, compact = false): string {
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    if (compact) {
      const secs = seconds % 60;
      return secs > 0 ? `${minutes}m ${String(secs).padStart(2, "0")}s` : `${minutes}m`;
    }
    return `${minutes}m`;
  }

  return `${seconds}s`;
}

function formatTimeAgo(iso: string | null, now: number): string {
  if (!iso) return "Never";

  const diffSeconds = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));

  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
  return `${Math.floor(diffSeconds / 86400)}d ago`;
}

function getCountdownState(
  lastRunAt: string | null,
  intervalSeconds: number,
  enabled: boolean,
  isRunning: boolean,
  now: number,
) {
  if (!enabled) {
    return {
      progress: 0,
      centerLabel: "Off",
      helperLabel: "Paused",
      statusLabel: "Paused",
    };
  }

  if (isRunning) {
    return {
      progress: 1,
      centerLabel: "Now",
      helperLabel: "Running",
      statusLabel: "Live",
    };
  }

  if (!lastRunAt) {
    return {
      progress: 0,
      centerLabel: "--",
      helperLabel: "Awaiting first run",
      statusLabel: "Pending",
    };
  }

  const remainingSeconds = Math.max(
    0,
    Math.ceil((new Date(lastRunAt).getTime() + intervalSeconds * 1000 - now) / 1000),
  );
  const elapsedSeconds = Math.min(intervalSeconds, Math.max(0, intervalSeconds - remainingSeconds));
  const progress = intervalSeconds > 0 ? elapsedSeconds / intervalSeconds : 0;

  return {
    progress,
    centerLabel: remainingSeconds === 0 ? "Due" : formatDuration(remainingSeconds, true),
    helperLabel: remainingSeconds === 0 ? "Ready to run" : "Until next run",
    statusLabel: remainingSeconds === 0 ? "Due" : "Scheduled",
  };
}

interface JobRingProps {
  job: JobDefinition;
  enabled: boolean;
  runningJobs: JobType[];
  now: number;
}

export function JobRing({ job, enabled, runningJobs, now }: JobRingProps) {
  const isRunning = runningJobs.includes(job.key);
  const state = getCountdownState(job.lastRunAt, job.intervalSeconds, enabled, isRunning, now);
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - state.progress);
  const Icon = job.icon;
  const accentTextClass = enabled ? job.textClass : "text-slate-600";
  const badgeSurfaceClass = enabled ? job.surfaceClass : "border-white/10 bg-white/5 text-slate-400";
  const showStatusBadge = state.statusLabel !== "Scheduled";

  return (
    <div className="rounded-[1.35rem] border border-white/8 bg-slate-950/45 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            {job.label}
          </p>
          <p className="mt-1 text-xs text-slate-400">Every {formatDuration(job.intervalSeconds)}</p>
        </div>
        {showStatusBadge ? (
          <div
            className={cn(
              "rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
              badgeSurfaceClass,
            )}
          >
            {state.statusLabel}
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-col items-center gap-3">
        <div className="relative h-[4.5rem] w-[4.5rem] shrink-0">
          <svg className="h-[4.5rem] w-[4.5rem] -rotate-90" viewBox="0 0 72 72">
            <circle
              cx="36"
              cy="36"
              r={radius}
              fill="none"
              stroke="rgba(148, 163, 184, 0.14)"
              strokeWidth="6"
            />
            <circle
              cx="36"
              cy="36"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className={cn(
                "transition-[stroke-dashoffset] duration-700 ease-out",
                accentTextClass,
              )}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <Icon className={cn("mb-1 h-3.5 w-3.5", accentTextClass)} />
            <span className="text-[11px] font-semibold text-white">{state.centerLabel}</span>
          </div>
        </div>
        <p className="text-center text-xs text-slate-400">
          {state.helperLabel} · Last {formatTimeAgo(job.lastRunAt, now)}
        </p>
      </div>
    </div>
  );
}
