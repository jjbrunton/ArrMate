"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowUpRight,
  Database,
  Film,
  MonitorPlay,
  RefreshCw,
  Server,
  Tv,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils/cn";
import { getInstanceDefinition, type InstanceType } from "@/lib/instances/definitions";

type JobType = "poll" | "sync-media" | "health-check" | "sync-requests" | "quality-check";

interface DashboardInstance {
  id: number;
  name: string;
  type: InstanceType;
  baseUrl: string;
  enabled: boolean;
  autoFix: boolean;
  lastHealthStatus: "healthy" | "unhealthy" | "unknown" | null;
  lastHealthCheck: string | null;
  lastPolledAt: string | null;
  pollIntervalSeconds: number;
  mediaSyncIntervalSeconds: number;
  lastMediaSyncAt: string | null;
  requestSyncIntervalSeconds: number | null;
  lastRequestSyncAt: string | null;
  queueCount: number;
  activeIssues: number;
  mediaCount: number | null;
  requestCount: number;
  pendingRequestCount: number;
  availableRequestCount: number;
  runningJobs: JobType[];
  busy: boolean;
}

interface JobDefinition {
  key: JobType;
  label: string;
  intervalSeconds: number;
  lastRunAt: string | null;
  icon: LucideIcon;
  textClass: string;
  surfaceClass: string;
}

const HEALTH_CHECK_INTERVAL_SECONDS = 300;

function formatInterval(seconds: number): string {
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  if (seconds >= 60) {
    return `${Math.floor(seconds / 60)}m`;
  }

  return `${seconds}s`;
}

function formatCompactDuration(seconds: number): string {
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${minutes}m ${String(secs).padStart(2, "0")}s` : `${minutes}m`;
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
    centerLabel: remainingSeconds === 0 ? "Due" : formatCompactDuration(remainingSeconds),
    helperLabel: remainingSeconds === 0 ? "Ready to run" : "Until next run",
    statusLabel: remainingSeconds === 0 ? "Due" : "Scheduled",
  };
}

function getHealthVariant(status: DashboardInstance["lastHealthStatus"]) {
  if (status === "healthy") return "success";
  if (status === "unhealthy") return "critical";
  return "default";
}

function JobRing({
  job,
  enabled,
  runningJobs,
  now,
}: {
  job: JobDefinition;
  enabled: boolean;
  runningJobs: JobType[];
  now: number;
}) {
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
          <p className="mt-1 text-xs text-slate-400">Every {formatInterval(job.intervalSeconds)}</p>
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

export function InstanceOverviewCards() {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-instances"],
    queryFn: async () => {
      const res = await fetch("/api/instances");
      if (!res.ok) throw new Error("Failed to fetch instances");
      const json = await res.json();
      return (json.data ?? []) as DashboardInstance[];
    },
    refetchInterval: (query) => {
      const instances = query.state.data as DashboardInstance[] | undefined;
      return instances?.some((instance) => instance.busy) ? 1000 : 5000;
    },
  });

  if (isLoading) {
    return (
      <section className="app-panel flex items-center justify-center py-12">
        <Spinner />
      </section>
    );
  }

  if (!data?.length) {
    return (
      <section className="app-empty-state py-14 text-center">
        <p className="text-base font-medium text-slate-100">No instances configured yet</p>
        <p className="mt-2 text-sm text-slate-500">
          Add an instance to start tracking scheduler cadence and service health.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="app-eyebrow">Instance Cadence</p>
          <h2 className="mt-2 text-xl font-semibold text-white">Scheduler clocks</h2>
        </div>
        <p className="max-w-md text-sm text-slate-400">
          Live timers and instance health for every connection.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {data.map((instance) => {
          const definition = getInstanceDefinition(instance.type);
          const TypeIcon = instance.type === "sonarr" ? Tv : instance.type === "radarr" ? Film : MonitorPlay;
          const healthVariant = getHealthVariant(instance.lastHealthStatus);
          const jobs: JobDefinition[] = [
            ...(definition.supportsQueue
              ? [
                  {
                    key: "poll" as const,
                    label: "Poll",
                    intervalSeconds: instance.pollIntervalSeconds,
                    lastRunAt: instance.lastPolledAt,
                    icon: RefreshCw,
                    textClass: "text-cyan-300",
                    surfaceClass: "border-cyan-300/20 bg-cyan-400/10 text-cyan-300",
                  },
                  {
                    key: "sync-media" as const,
                    label: "Media",
                    intervalSeconds: instance.mediaSyncIntervalSeconds,
                    lastRunAt: instance.lastMediaSyncAt,
                    icon: Database,
                    textClass: "text-sky-300",
                    surfaceClass: "border-sky-300/20 bg-sky-400/10 text-sky-300",
                  },
                ]
              : []),
            ...(definition.supportsRequestSync
              ? [
                  {
                    key: "sync-requests" as const,
                    label: "Requests",
                    intervalSeconds: instance.requestSyncIntervalSeconds ?? 300,
                    lastRunAt: instance.lastRequestSyncAt,
                    icon: MonitorPlay,
                    textClass: "text-violet-300",
                    surfaceClass: "border-violet-300/20 bg-violet-400/10 text-violet-300",
                  },
                ]
              : []),
            {
              key: "health-check",
              label: "Health",
              intervalSeconds: HEALTH_CHECK_INTERVAL_SECONDS,
              lastRunAt: instance.lastHealthCheck,
              icon: Activity,
              textClass: "text-emerald-300",
              surfaceClass: "border-emerald-300/20 bg-emerald-400/10 text-emerald-300",
            },
          ];

          return (
            <Card
              key={instance.id}
              className={cn(
                "relative overflow-hidden",
                !instance.enabled && "opacity-75",
              )}
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              <CardHeader className="gap-3 border-b border-white/6 pb-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/6">
                      <TypeIcon className="h-[1.125rem] w-[1.125rem] text-white" />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="app-eyebrow">{instance.type}</p>
                        {!instance.enabled ? <Badge>disabled</Badge> : null}
                        {instance.busy ? <Badge variant="info">job running</Badge> : null}
                        {instance.autoFix ? <Badge variant="info">auto-fix</Badge> : null}
                        <Badge variant={healthVariant}>{instance.lastHealthStatus ?? "unknown"}</Badge>
                      </div>
                      <CardTitle className="text-lg">{instance.name}</CardTitle>
                      <p className="max-w-[28rem] truncate text-sm text-slate-400">{instance.baseUrl}</p>
                    </div>
                  </div>

                  <Link
                    href={`/instances/${instance.id}`}
                    className="inline-flex items-center gap-2 self-start rounded-full border border-white/10 bg-white/6 px-3 py-2 text-sm text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    Open
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </div>
              </CardHeader>

              <CardContent className="space-y-4 pt-4">
                <div className="grid gap-2 sm:grid-cols-3">
                  {definition.supportsQueue ? (
                    <>
                      <div className="rounded-[1.1rem] border border-white/8 bg-white/[0.04] px-3 py-3">
                        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-slate-500">
                          <Server className="h-3.5 w-3.5" />
                          Queue
                        </div>
                        <div className="mt-2 flex items-end justify-between gap-3">
                          <p className="text-2xl font-semibold text-white">{instance.queueCount}</p>
                          <span className="text-xs text-slate-500">tracked</span>
                        </div>
                      </div>

                      <div className="rounded-[1.1rem] border border-white/8 bg-white/[0.04] px-3 py-3">
                        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-slate-500">
                          <TriangleAlert className="h-3.5 w-3.5" />
                          Issues
                        </div>
                        <div className="mt-2 flex items-end justify-between gap-3">
                          <p className={cn("text-2xl font-semibold", instance.activeIssues > 0 ? "text-amber-200" : "text-white")}>
                            {instance.activeIssues}
                          </p>
                          <span className="text-xs text-slate-500">active</span>
                        </div>
                      </div>

                      <div className="rounded-[1.1rem] border border-white/8 bg-white/[0.04] px-3 py-3">
                        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-slate-500">
                          <TypeIcon className="h-3.5 w-3.5" />
                          {definition.libraryLabel}
                        </div>
                        <div className="mt-2 flex items-end justify-between gap-3">
                          <p className="text-2xl font-semibold text-white">{instance.mediaCount ?? "—"}</p>
                          <span className="text-xs text-slate-500">
                            {instance.mediaCount === null ? "pending" : "cached"}
                          </span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="rounded-[1.1rem] border border-white/8 bg-white/[0.04] px-3 py-3">
                        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-slate-500">
                          <MonitorPlay className="h-3.5 w-3.5" />
                          Requests
                        </div>
                        <div className="mt-2 flex items-end justify-between gap-3">
                          <p className="text-2xl font-semibold text-white">{instance.requestCount}</p>
                          <span className="text-xs text-slate-500">imported</span>
                        </div>
                      </div>

                      <div className="rounded-[1.1rem] border border-white/8 bg-white/[0.04] px-3 py-3">
                        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-slate-500">
                          <TriangleAlert className="h-3.5 w-3.5" />
                          Pending
                        </div>
                        <div className="mt-2 flex items-end justify-between gap-3">
                          <p className="text-2xl font-semibold text-white">{instance.pendingRequestCount}</p>
                          <span className="text-xs text-slate-500">awaiting</span>
                        </div>
                      </div>

                      <div className="rounded-[1.1rem] border border-white/8 bg-white/[0.04] px-3 py-3">
                        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-slate-500">
                          <TypeIcon className="h-3.5 w-3.5" />
                          Available
                        </div>
                        <div className="mt-2 flex items-end justify-between gap-3">
                          <p className="text-2xl font-semibold text-white">{instance.availableRequestCount}</p>
                          <span className="text-xs text-slate-500">ready</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <div className={cn("grid gap-3", jobs.length >= 3 ? "lg:grid-cols-3" : "lg:grid-cols-2")}>
                  {jobs.map((job) => (
                    <JobRing
                      key={job.key}
                      job={job}
                      enabled={instance.enabled}
                      runningJobs={instance.runningJobs}
                      now={now}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
