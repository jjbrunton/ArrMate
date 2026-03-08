"use client";

import { use, useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Activity, ArrowLeft, Database, RefreshCw, ShieldQuestion, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Spinner } from "@/components/ui/spinner";
import { QueueTable } from "@/components/queue/queue-table";
import { IssueCard, type IssueData } from "@/components/issues/issue-card";
import { CutoffTable } from "@/components/cutoff/cutoff-table";
import { ScheduledJobsPanel } from "@/components/instances/scheduled-jobs-panel";
import { RequestTable } from "@/components/requests/request-table";
import { useToast } from "@/components/ui/toast";
import { PageHero } from "@/components/layout/page-hero";
import { getInstanceDefinition, type InstanceType } from "@/lib/instances/definitions";

interface InstanceDetail {
  id: number;
  name: string;
  type: InstanceType;
  baseUrl: string;
  enabled: boolean;
  autoFix: boolean;
  lastHealthStatus: string | null;
  lastHealthCheck: string | null;
  lastPolledAt: string | null;
  lastQualityCheckAt: string | null;
  pollIntervalSeconds: number;
  qualityCheckMaxItems: number;
  mediaSyncIntervalSeconds: number;
  lastMediaSyncAt: string | null;
  requestSyncIntervalSeconds: number | null;
  lastRequestSyncAt: string | null;
  queueCount: number;
  activeIssues: number;
  totalRequests: number;
  pendingRequests: number;
  availableRequests: number;
}

interface JobStatus {
  running: string[];
  busy: boolean;
}

export default function InstanceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const instanceId = Number(id);
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("queue");

  const { data: instance, isLoading } = useQuery({
    queryKey: ["instances", instanceId],
    queryFn: async () => {
      const res = await fetch(`/api/instances/${instanceId}`);
      if (!res.ok) throw new Error("Failed to fetch instance");
      const json = await res.json();
      return json.data as InstanceDetail;
    },
  });

  const { data: jobStatus } = useQuery({
    queryKey: ["job-status", instanceId],
    queryFn: async () => {
      const res = await fetch(`/api/instances/${instanceId}/job-status`);
      if (!res.ok) throw new Error("Failed to fetch job status");
      const json = await res.json();
      return json.data as JobStatus;
    },
    refetchInterval: (query) => {
      // Poll every 1s while a job is running, otherwise every 5s
      return query.state.data?.busy ? 1000 : 5000;
    },
  });

  const definition = instance ? getInstanceDefinition(instance.type) : null;
  const toggleMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/instances/${instanceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !instance?.enabled }),
      });
      if (!res.ok) throw new Error("Failed to update");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instances", instanceId] });
    },
  });

  const autoFixMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/instances/${instanceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoFix: !instance?.autoFix }),
      });
      if (!res.ok) throw new Error("Failed to update");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instances", instanceId] });
    },
  });

  const { toast } = useToast();

  const pollMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/instances/${instanceId}/poll`, { method: "POST" });
      if (res.status === 409) throw new Error("A job is already running");
      if (!res.ok) throw new Error("Failed to poll");
      return res.json();
    },
    onMutate: () => {
      queryClient.invalidateQueries({ queryKey: ["job-status", instanceId] });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instances", instanceId] });
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      queryClient.invalidateQueries({ queryKey: ["job-status", instanceId] });
      toast({ title: "Poll complete", description: "Queue and issues refreshed", variant: "success" });
    },
    onError: (err: Error) => {
      queryClient.invalidateQueries({ queryKey: ["job-status", instanceId] });
      toast({ title: "Poll failed", description: err.message, variant: "error" });
    },
  });

  const syncMediaMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/instances/${instanceId}/sync-media`, { method: "POST" });
      if (res.status === 409) throw new Error("A job is already running");
      if (!res.ok) throw new Error("Failed to sync");
      return res.json();
    },
    onMutate: () => {
      queryClient.invalidateQueries({ queryKey: ["job-status", instanceId] });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instances", instanceId] });
      queryClient.invalidateQueries({ queryKey: ["job-status", instanceId] });
      toast({ title: "Media sync complete", description: "Media cache refreshed", variant: "success" });
    },
    onError: (err: Error) => {
      queryClient.invalidateQueries({ queryKey: ["job-status", instanceId] });
      toast({ title: "Media sync failed", description: err.message, variant: "error" });
    },
  });

  const qualityCheckMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/instances/${instanceId}/quality-check`, { method: "POST" });
      if (res.status === 409) throw new Error("A quality check is already running");
      if (!res.ok) throw new Error("Failed to run quality checks");
      return res.json();
    },
    onMutate: () => {
      queryClient.invalidateQueries({ queryKey: ["job-status", instanceId] });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instances", instanceId] });
      queryClient.invalidateQueries({ queryKey: ["cutoff", instanceId] });
      queryClient.invalidateQueries({ queryKey: ["job-status", instanceId] });
      toast({ title: "Quality check complete", description: "Quality status refreshed", variant: "success" });
    },
    onError: (err: Error) => {
      queryClient.invalidateQueries({ queryKey: ["job-status", instanceId] });
      toast({ title: "Quality check failed", description: err.message, variant: "error" });
    },
  });

  const requestSyncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/instances/${instanceId}/sync-requests`, { method: "POST" });
      if (res.status === 409) throw new Error("A request sync is already running");
      if (!res.ok) throw new Error("Failed to sync requests");
      return res.json();
    },
    onMutate: () => {
      queryClient.invalidateQueries({ queryKey: ["job-status", instanceId] });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instances", instanceId] });
      queryClient.invalidateQueries({ queryKey: ["requests", instanceId] });
      queryClient.invalidateQueries({ queryKey: ["job-status", instanceId] });
      toast({ title: "Request sync complete", description: "Imported requests refreshed", variant: "success" });
    },
    onError: (err: Error) => {
      queryClient.invalidateQueries({ queryKey: ["job-status", instanceId] });
      toast({ title: "Request sync failed", description: err.message, variant: "error" });
    },
  });

  const dismissAllMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/issues/dismiss-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceId }),
      });
      if (!res.ok) throw new Error("Failed to dismiss issues");
      const json = await res.json();
      return json.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["instances", instanceId] });
      toast({
        title: "Issues dismissed",
        description: `${data.dismissed} issue${data.dismissed !== 1 ? "s" : ""} dismissed`,
        variant: "success",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "error" });
    },
  });

  const { data: issues } = useQuery({
    queryKey: ["issues", instanceId],
    enabled: definition?.supportsIssues === true,
    queryFn: async () => {
      const res = await fetch(`/api/issues?instanceId=${instanceId}`);
      if (!res.ok) throw new Error("Failed to fetch issues");
      const json = await res.json();
      return (json.data ?? []) as IssueData[];
    },
  });

  const wasQualityCheckRunning = useRef(false);
  const wasRequestSyncRunning = useRef(false);

  useEffect(() => {
    const isQualityCheckRunning = jobStatus?.running.includes("quality-check") === true;
    const isRequestSyncRunning = jobStatus?.running.includes("sync-requests") === true;

    if (wasQualityCheckRunning.current && !isQualityCheckRunning) {
      queryClient.invalidateQueries({ queryKey: ["instances", instanceId] });
      queryClient.invalidateQueries({ queryKey: ["cutoff", instanceId] });
    }

    if (wasRequestSyncRunning.current && !isRequestSyncRunning) {
      queryClient.invalidateQueries({ queryKey: ["instances", instanceId] });
      queryClient.invalidateQueries({ queryKey: ["requests", instanceId] });
    }

    wasQualityCheckRunning.current = isQualityCheckRunning;
    wasRequestSyncRunning.current = isRequestSyncRunning;
  }, [instanceId, jobStatus?.running, queryClient]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (!instance) {
    return (
      <div className="app-empty-state py-12 text-center text-slate-400">Instance not found</div>
    );
  }

  const healthVariant =
    instance.lastHealthStatus === "healthy"
      ? "success"
      : instance.lastHealthStatus === "unhealthy"
        ? "critical"
        : "default";
  const availableTabs = [
    ...(definition?.supportsQueue ? ["queue"] : []),
    ...(definition?.supportsIssues ? ["issues"] : []),
    ...(definition?.supportsQuality ? ["quality"] : []),
    ...(definition?.supportsRequestSync ? ["requests"] : []),
  ];
  const defaultTab = definition?.supportsQueue
    ? "queue"
    : definition?.supportsRequestSync
      ? "requests"
      : definition?.supportsIssues
        ? "issues"
        : "queue";
  const selectedTab = availableTabs.includes(activeTab) ? activeTab : defaultTab;

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/instances">
            <ArrowLeft className="h-4 w-4" />
            Back to instances
          </Link>
        </Button>
      </div>

      <PageHero
        kicker={instance.type}
        title={instance.name}
        description={instance.baseUrl}
        meta={
          <>
            <Badge variant={healthVariant}>{instance.lastHealthStatus || "unknown"}</Badge>
            {definition?.supportsQueue ? (
              <>
                <div className="app-stat-chip">
                  Queue
                  <strong className="text-white">{instance.queueCount}</strong>
                </div>
                <div className="app-stat-chip">
                  Issues
                  <strong className="text-white">{instance.activeIssues}</strong>
                </div>
              </>
            ) : (
              <>
                <div className="app-stat-chip">
                  Requests
                  <strong className="text-white">{instance.totalRequests}</strong>
                </div>
                <div className="app-stat-chip">
                  Pending
                  <strong className="text-white">{instance.pendingRequests}</strong>
                </div>
              </>
            )}
          </>
        }
        actions={
          <>
            <div className="app-panel-muted flex items-center gap-3 px-4 py-3">
              <span className="text-sm text-slate-400">
                {instance.enabled ? "Enabled" : "Disabled"}
              </span>
              <Switch
                checked={instance.enabled}
                onCheckedChange={() => toggleMutation.mutate()}
                disabled={toggleMutation.isPending}
                aria-label={instance.enabled ? "Disable instance" : "Enable instance"}
              />
            </div>
            {definition?.supportsAutoFix ? (
              <div className="app-panel-muted flex items-center gap-3 px-4 py-3">
                <span className="text-sm text-slate-400">Auto-fix</span>
                <Switch
                  checked={instance.autoFix}
                  onCheckedChange={() => autoFixMutation.mutate()}
                  disabled={autoFixMutation.isPending}
                  aria-label={instance.autoFix ? "Disable auto-fix" : "Enable auto-fix"}
                />
              </div>
            ) : null}
          </>
        }
      />

      <ScheduledJobsPanel
        jobs={[
          ...(definition?.supportsQueue
            ? [
                {
                  key: "poll",
                  name: "Queue Management",
                  icon: <RefreshCw className="h-4 w-4 text-cyan-300" />,
                  intervalSeconds: instance.pollIntervalSeconds,
                  lastRunAt: instance.lastPolledAt,
                  enabled: instance.enabled,
                  onRunNow: () => pollMutation.mutate(),
                  isRunning: pollMutation.isPending || jobStatus?.running.includes("poll") === true,
                  isRunDisabled: pollMutation.isPending || jobStatus?.running.includes("poll") === true,
                },
                {
                  key: "quality-check",
                  name: "Quality Checks",
                  icon: <RefreshCw className="h-4 w-4 text-amber-300" />,
                  intervalSeconds: 300,
                  lastRunAt: instance.lastQualityCheckAt,
                  enabled: instance.enabled,
                  onRunNow: () => qualityCheckMutation.mutate(),
                  isRunning: qualityCheckMutation.isPending || jobStatus?.running.includes("quality-check") === true,
                  isRunDisabled: qualityCheckMutation.isPending || jobStatus?.running.includes("quality-check") === true,
                },
                {
                  key: "sync-media",
                  name: "Media Cache",
                  icon: <Database className="h-4 w-4 text-blue-300" />,
                  intervalSeconds: instance.mediaSyncIntervalSeconds,
                  lastRunAt: instance.lastMediaSyncAt,
                  enabled: instance.enabled,
                  onRunNow: () => syncMediaMutation.mutate(),
                  isRunning: syncMediaMutation.isPending || jobStatus?.running.includes("sync-media") === true,
                  isRunDisabled: syncMediaMutation.isPending || jobStatus?.running.includes("sync-media") === true,
                },
              ]
            : []),
          ...(definition?.supportsRequestSync
            ? [
                {
                  key: "sync-requests",
                  name: "Request Sync",
                  icon: <ShieldQuestion className="h-4 w-4 text-violet-300" />,
                  intervalSeconds: instance.requestSyncIntervalSeconds ?? 300,
                  lastRunAt: instance.lastRequestSyncAt,
                  enabled: instance.enabled,
                  onRunNow: () => requestSyncMutation.mutate(),
                  isRunning: requestSyncMutation.isPending || jobStatus?.running.includes("sync-requests") === true,
                  isRunDisabled: requestSyncMutation.isPending || jobStatus?.running.includes("sync-requests") === true,
                },
              ]
            : []),
          {
            key: "health-check",
            name: "Health Check",
            icon: <Activity className="h-4 w-4 text-emerald-300" />,
            intervalSeconds: 300,
            lastRunAt: instance.lastHealthCheck,
            enabled: instance.enabled,
            isRunning: jobStatus?.running.includes("health-check") === true,
          },
        ]}
      />

      <Tabs value={selectedTab} onValueChange={setActiveTab}>
        <TabsList>
          {definition?.supportsQueue ? (
            <TabsTrigger value="queue">Queue ({instance.queueCount})</TabsTrigger>
          ) : null}
          {definition?.supportsIssues ? (
            <TabsTrigger value="issues">Issues ({instance.activeIssues})</TabsTrigger>
          ) : null}
          {definition?.supportsQuality ? (
            <TabsTrigger value="quality">Media Management</TabsTrigger>
          ) : null}
          {definition?.supportsRequestSync ? (
            <TabsTrigger value="requests">Requests ({instance.totalRequests})</TabsTrigger>
          ) : null}
        </TabsList>

        {definition?.supportsQueue ? (
          <TabsContent value="queue">
            <section className="app-panel p-5 sm:p-6">
              <QueueTable instanceId={instanceId} />
            </section>
          </TabsContent>
        ) : null}

        {definition?.supportsIssues ? (
          <TabsContent value="issues">
            {issues?.length ? (
              <section className="app-panel space-y-4 p-5 sm:p-6">
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => dismissAllMutation.mutate()}
                    disabled={dismissAllMutation.isPending}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Dismiss all
                  </Button>
                </div>
                {issues.map((issue) => (
                  <IssueCard key={issue.id} issue={issue} />
                ))}
              </section>
            ) : (
              <div className="app-empty-state py-10 text-center text-sm text-slate-500">
                No active issues for this instance
              </div>
            )}
          </TabsContent>
        ) : null}

        {definition?.supportsQuality ? (
          <TabsContent value="quality">
            <section className="app-panel p-5 sm:p-6">
              <CutoffTable instanceId={instanceId} instanceType={instance.type} enabled={selectedTab === "quality"} />
            </section>
          </TabsContent>
        ) : null}

        {definition?.supportsRequestSync ? (
          <TabsContent value="requests">
            <section className="app-panel p-5 sm:p-6">
              <RequestTable instanceId={instanceId} />
            </section>
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
