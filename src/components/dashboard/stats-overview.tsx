"use client";

import { useQuery } from "@tanstack/react-query";
import { Server, AlertTriangle, AlertCircle, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Stats {
  totalInstances: number;
  healthyInstances: number;
  activeIssues: number;
  criticalIssues: number;
  warningIssues: number;
}

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <CardContent className="flex items-center gap-3 p-4 sm:gap-4 sm:p-5">
            <div className="h-10 w-10 animate-pulse rounded-xl bg-white/8 sm:h-12 sm:w-12 sm:rounded-2xl" />
            <div className="space-y-2">
              <div className="h-3 w-14 animate-pulse rounded bg-white/8" />
              <div className="h-7 w-8 animate-pulse rounded bg-white/8" />
              <div className="hidden h-3 w-16 animate-pulse rounded bg-white/8 sm:block" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function StatsOverview() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const res = await fetch("/api/health");
      if (!res.ok) throw new Error("Failed to fetch stats");
      const json = await res.json();
      return json.data as Stats & { status: string };
    },
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return <StatsSkeleton />;
  }

  if (isError) {
    return (
      <div className="app-empty-state flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-sm font-medium text-slate-200">Failed to load stats</p>
        <Button size="sm" variant="outline" onClick={() => void refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  const cards = [
    {
      label: "Instances",
      value: data?.totalInstances ?? 0,
      sub: `${data?.healthyInstances ?? 0} healthy`,
      icon: Server,
      color: "text-cyan-200",
      surface: "bg-cyan-400/10 border-cyan-300/15",
    },
    {
      label: "Active Issues",
      value: data?.activeIssues ?? 0,
      sub: "across all instances",
      icon: AlertTriangle,
      color: "text-amber-200",
      surface: "bg-amber-400/10 border-amber-300/15",
    },
    {
      label: "Critical",
      value: data?.criticalIssues ?? 0,
      sub: "need attention",
      icon: AlertCircle,
      color: "text-rose-200",
      surface: "bg-rose-400/10 border-rose-300/15",
    },
    {
      label: "Warnings",
      value: data?.warningIssues ?? 0,
      sub: "monitoring",
      icon: AlertTriangle,
      color: "text-yellow-200",
      surface: "bg-yellow-400/10 border-yellow-300/15",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      {cards.map((c) => (
        <Card key={c.label} className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <CardContent className="flex items-center gap-3 p-4 sm:gap-4 sm:p-5">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl border sm:h-12 sm:w-12 sm:rounded-2xl ${c.surface} ${c.color}`}>
              <c.icon className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0 space-y-0.5 sm:space-y-1">
              <p className="app-eyebrow">{c.label}</p>
              <p className="text-2xl font-semibold text-white sm:text-3xl">{c.value}</p>
              <p className="hidden text-sm text-slate-400 sm:block">
                {c.sub}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
