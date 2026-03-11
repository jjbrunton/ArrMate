"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { InstanceCard } from "@/components/instances/instance-card";
import { InstanceForm } from "@/components/instances/instance-form";
import { PageHero } from "@/components/layout/page-hero";
import type { InstanceType } from "@/lib/instances/definitions";
import type { QualityCheckStrategy } from "@/lib/quality-check-strategy";

interface InstanceData {
  id: number;
  name: string;
  type: InstanceType;
  baseUrl: string;
    enabled: boolean;
    lastHealthStatus: string | null;
    lastHealthCheck: string | null;
    pollIntervalSeconds: number;
    qualityCheckIntervalSeconds: number;
    qualityCheckMaxItems: number;
    qualityCheckStrategy: QualityCheckStrategy;
    requestSyncIntervalSeconds: number | null;
    queueCount?: number;
    activeIssues?: number;
    mediaCount?: number | null;
    requestCount?: number;
    pendingRequestCount?: number;
    availableRequestCount?: number;
}

export default function InstancesPage() {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<InstanceData | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["instances"],
    queryFn: async () => {
      const res = await fetch("/api/instances");
      if (!res.ok) throw new Error("Failed to fetch instances");
      const json = await res.json();
      return (json.data ?? []) as InstanceData[];
    },
  });

  return (
    <div className="space-y-6">
      <PageHero
        title="Instances"
        description="Manage Sonarr, Radarr, and Overseerr connections, sync cadence, and automation settings."
        meta={
          <div className="app-stat-chip">
            <span className="app-status-dot bg-cyan-300 text-cyan-300" />
            {data?.length ?? 0} instance{(data?.length ?? 0) !== 1 ? "s" : ""} configured
          </div>
        }
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Add Instance
          </Button>
        }
      />

      {isLoading ? (
        <div className="app-panel flex items-center justify-center py-16">
          <Spinner />
        </div>
      ) : !data?.length ? (
        <div className="app-empty-state py-16 text-center">
          <p className="text-base font-medium text-slate-100">No instances configured yet</p>
          <p className="mt-2 text-sm text-slate-500">
            Add an instance to start tracking queue health, request activity, quality drift, and fixable issues.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.map((instance) => (
            <InstanceCard
              key={instance.id}
              instance={instance}
              onEdit={() => {
                setEditing(instance);
                setFormOpen(true);
              }}
            />
          ))}
        </div>
      )}

      <InstanceForm
        key={editing?.id ?? "new"}
        open={formOpen}
        onOpenChange={setFormOpen}
        instance={editing ?? undefined}
      />
    </div>
  );
}
