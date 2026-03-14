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
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";
import { getInstanceDefinition, type InstanceType } from "@/lib/instances/definitions";
import { JobRing, type JobDefinition, type JobType } from "./job-ring";
import { StatMiniCard } from "./stat-mini-card";

const HEALTH_CHECK_INTERVAL_SECONDS = 300;

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

function getHealthVariant(status: DashboardInstance["lastHealthStatus"]) {
  if (status === "healthy") return "success";
  if (status === "unhealthy") return "critical";
  return "default";
}

function buildJobs(instance: DashboardInstance, definition: ReturnType<typeof getInstanceDefinition>): JobDefinition[] {
  return [
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
      key: "health-check" as const,
      label: "Health",
      intervalSeconds: HEALTH_CHECK_INTERVAL_SECONDS,
      lastRunAt: instance.lastHealthCheck,
      icon: Activity,
      textClass: "text-emerald-300",
      surfaceClass: "border-emerald-300/20 bg-emerald-400/10 text-emerald-300",
    },
  ];
}

function InstanceSkeleton() {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {Array.from({ length: 2 }).map((_, i) => (
        <Card key={i} className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <CardHeader className="gap-3 border-b border-white/6 pb-4">
            <div className="flex items-start gap-4">
              <div className="h-11 w-11 animate-pulse rounded-2xl bg-white/8" />
              <div className="space-y-2">
                <div className="h-3 w-24 animate-pulse rounded bg-white/8" />
                <div className="h-5 w-40 animate-pulse rounded bg-white/8" />
                <div className="h-3 w-56 animate-pulse rounded bg-white/8" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="grid gap-2 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="h-20 animate-pulse rounded-[1.1rem] bg-white/5" />
              ))}
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="h-36 animate-pulse rounded-[1.35rem] bg-white/5" />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function InstanceCard({ instance, now }: { instance: DashboardInstance; now: number }) {
  const definition = getInstanceDefinition(instance.type);
  const TypeIcon = instance.type === "sonarr" ? Tv : instance.type === "radarr" ? Film : MonitorPlay;
  const healthVariant = getHealthVariant(instance.lastHealthStatus);
  const jobs = buildJobs(instance, definition);

  return (
    <Card className={cn("relative overflow-hidden", !instance.enabled && "opacity-75")}>
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
              <StatMiniCard icon={Server} label="Queue" value={instance.queueCount} sub="tracked" />
              <StatMiniCard
                icon={TriangleAlert}
                label="Issues"
                value={instance.activeIssues}
                sub="active"
                valueClassName={instance.activeIssues > 0 ? "text-amber-200" : undefined}
              />
              <StatMiniCard
                icon={TypeIcon}
                label={definition.libraryLabel ?? "Media"}
                value={instance.mediaCount ?? "\u2014"}
                sub={instance.mediaCount === null ? "pending" : "cached"}
              />
            </>
          ) : (
            <>
              <StatMiniCard icon={MonitorPlay} label="Requests" value={instance.requestCount} sub="imported" />
              <StatMiniCard icon={TriangleAlert} label="Pending" value={instance.pendingRequestCount} sub="awaiting" />
              <StatMiniCard icon={TypeIcon} label="Available" value={instance.availableRequestCount} sub="ready" />
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
}

export function InstanceOverviewCards() {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  const { data, isLoading, isError, refetch } = useQuery({
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
    return <InstanceSkeleton />;
  }

  if (isError) {
    return (
      <div className="app-empty-state flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-sm font-medium text-slate-200">Failed to load instances</p>
        <Button size="sm" variant="outline" onClick={() => void refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  if (!data?.length) {
    return (
      <div className="app-empty-state py-14 text-center">
        <p className="text-base font-medium text-slate-100">No instances configured yet</p>
        <p className="mt-2 text-sm text-slate-500">
          Add an instance to start tracking scheduler cadence and service health.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {data.map((instance) => (
        <InstanceCard key={instance.id} instance={instance} now={now} />
      ))}
    </div>
  );
}
