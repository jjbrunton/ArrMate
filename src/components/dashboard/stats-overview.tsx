"use client";

import { useQuery } from "@tanstack/react-query";
import { Server, AlertTriangle, AlertCircle, CheckCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

interface Stats {
  totalInstances: number;
  healthyInstances: number;
  activeIssues: number;
  criticalIssues: number;
  warningIssues: number;
}

export function StatsOverview() {
  const { data, isLoading } = useQuery({
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
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner />
      </div>
    );
  }

  const stats = data;

  const cards = [
    {
      label: "Instances",
      value: stats?.totalInstances ?? 0,
      sub: `${stats?.healthyInstances ?? 0} healthy`,
      icon: Server,
      color: "text-cyan-200",
      surface: "bg-cyan-400/10 border-cyan-300/15",
    },
    {
      label: "Active Issues",
      value: stats?.activeIssues ?? 0,
      sub: "across all instances",
      icon: AlertTriangle,
      color: "text-amber-200",
      surface: "bg-amber-400/10 border-amber-300/15",
    },
    {
      label: "Critical",
      value: stats?.criticalIssues ?? 0,
      sub: "need attention",
      icon: AlertCircle,
      color: "text-rose-200",
      surface: "bg-rose-400/10 border-rose-300/15",
    },
    {
      label: "Healthy",
      value: stats?.healthyInstances ?? 0,
      sub: `of ${stats?.totalInstances ?? 0}`,
      icon: CheckCircle,
      color: "text-emerald-200",
      surface: "bg-emerald-400/10 border-emerald-300/15",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.label} className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <CardContent className="flex items-center gap-4 p-5 sm:p-6">
            <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${c.surface} ${c.color}`}>
              <c.icon className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <p className="app-eyebrow">{c.label}</p>
              <p className="text-3xl font-semibold text-white">{c.value}</p>
              <p className="text-sm text-slate-400">
                {c.sub}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
