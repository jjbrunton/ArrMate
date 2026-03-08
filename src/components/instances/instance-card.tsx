"use client";

import { Film, MonitorPlay, Settings, Trash2, Tv, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";
import { getInstanceDefinition, type InstanceType } from "@/lib/instances/definitions";

interface InstanceCardProps {
  instance: {
    id: number;
    name: string;
    type: InstanceType;
    baseUrl: string;
    enabled: boolean;
    lastHealthStatus: string | null;
    lastHealthCheck: string | null;
    queueCount?: number;
    activeIssues?: number;
    mediaCount?: number | null;
    requestCount?: number;
    pendingRequestCount?: number;
    availableRequestCount?: number;
  };
  onEdit: () => void;
}

export function InstanceCard({ instance, onEdit }: InstanceCardProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/instances/${instance.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instances"] });
      toast({ title: "Instance deleted", variant: "success" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/instances/${instance.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !instance.enabled }),
      });
      if (!res.ok) throw new Error("Failed to update");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instances"] });
    },
  });

  const healthVariant =
    instance.lastHealthStatus === "healthy"
      ? "success"
      : instance.lastHealthStatus === "unhealthy"
        ? "critical"
        : "default";
  const definition = getInstanceDefinition(instance.type);
  const TypeIcon = instance.type === "sonarr" ? Tv : instance.type === "radarr" ? Film : MonitorPlay;

  return (
    <Card className={cn("relative overflow-hidden", !instance.enabled && "opacity-70")}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/35 to-transparent" />
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/15 bg-cyan-400/10">
            <TypeIcon className="h-5 w-5 text-cyan-200" />
          </div>
          <div className="space-y-2">
            <p className="app-eyebrow">{instance.type}</p>
            <CardTitle className="text-base">{instance.name}</CardTitle>
            <p className="text-sm text-slate-400">{instance.baseUrl}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 self-start">
          <Badge variant={healthVariant}>
            {instance.lastHealthStatus || "unknown"}
          </Badge>
          <Switch
            checked={instance.enabled}
            onCheckedChange={() => toggleMutation.mutate()}
            disabled={toggleMutation.isPending}
            aria-label={instance.enabled ? "Disable instance" : "Enable instance"}
          />
          <Button variant="ghost" size="icon" onClick={onEdit} aria-label={`Edit ${instance.name}`}>
            <Settings className="h-4 w-4" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={`Delete ${instance.name}`}>
                <Trash2 className="h-4 w-4 text-rose-300" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Instance</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete &ldquo;{instance.name}&rdquo; and all of its synced data.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel asChild>
                  <Button variant="ghost">Cancel</Button>
                </AlertDialogCancel>
                <AlertDialogAction asChild>
                  <Button variant="destructive" onClick={() => deleteMutation.mutate()}>
                    Delete
                  </Button>
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap gap-3 text-sm">
          {definition.supportsQueue ? (
            <>
              <span className="app-stat-chip">
                Queue
                <strong className="text-white">{instance.queueCount ?? "—"}</strong>
              </span>
              <span className="app-stat-chip">
                Issues
                <strong className="text-white">{instance.activeIssues ?? "—"}</strong>
              </span>
              <span className="app-stat-chip">
                {definition.libraryLabel}
                <strong className="text-white">{instance.mediaCount ?? "—"}</strong>
              </span>
            </>
          ) : (
            <>
              <span className="app-stat-chip">
                Requests
                <strong className="text-white">{instance.requestCount ?? 0}</strong>
              </span>
              <span className="app-stat-chip">
                Pending
                <strong className="text-white">{instance.pendingRequestCount ?? 0}</strong>
              </span>
              <span className="app-stat-chip">
                Available
                <strong className="text-white">{instance.availableRequestCount ?? 0}</strong>
              </span>
            </>
          )}
        </div>
        <Button asChild className="w-full justify-between">
          <Link href={`/instances/${instance.id}`}>
            Open Instance Dashboard
            <ExternalLink className="h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
