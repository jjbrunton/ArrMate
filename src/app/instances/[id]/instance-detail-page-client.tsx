"use client";

import { use, useState } from "react";
import Link from "next/link";
import { Activity, ArrowLeft, Database, RefreshCw, ShieldQuestion, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Spinner } from "@/components/ui/spinner";
import { QueueTable } from "@/components/queue/queue-table";
import { IssueCard } from "@/components/issues/issue-card";
import { CutoffTable } from "@/components/cutoff/cutoff-table";
import { ScheduledJobsPanel } from "@/components/instances/scheduled-jobs-panel";
import { RequestTable } from "@/components/requests/request-table";
import { PageHero } from "@/components/layout/page-hero";
import { useInstanceDetail } from "@/hooks/use-instance-detail";
import { useInstanceMutations } from "@/hooks/use-instance-mutations";

export default function InstanceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const instanceId = Number(id);
  const [activeTab, setActiveTab] = useState("queue");

  const { instance, isLoading, jobStatus, issues, definition } = useInstanceDetail(instanceId);
  const {
    toggleMutation,
    autoFixMutation,
    pollMutation,
    syncMediaMutation,
    qualityCheckMutation,
    requestSyncMutation,
    dismissAllMutation,
  } = useInstanceMutations(instanceId, jobStatus);

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
                onCheckedChange={() => toggleMutation.mutate(!instance.enabled)}
                disabled={toggleMutation.isPending}
                aria-label={instance.enabled ? "Disable instance" : "Enable instance"}
              />
            </div>
            {definition?.supportsAutoFix ? (
              <div className="app-panel-muted flex items-center gap-3 px-4 py-3">
                <span className="text-sm text-slate-400">Auto-fix</span>
                <Switch
                  checked={instance.autoFix}
                  onCheckedChange={() => autoFixMutation.mutate(!instance.autoFix)}
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
                  icon: <RefreshCw className="h-3.5 w-3.5 text-cyan-300" />,
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
                  icon: <RefreshCw className="h-3.5 w-3.5 text-amber-300" />,
                  intervalSeconds: instance.qualityCheckIntervalSeconds,
                  lastRunAt: instance.lastQualityCheckAt,
                  enabled: instance.enabled,
                  onRunNow: () => qualityCheckMutation.mutate(),
                  isRunning: qualityCheckMutation.isPending || jobStatus?.running.includes("quality-check") === true,
                  isRunDisabled: qualityCheckMutation.isPending || jobStatus?.running.includes("quality-check") === true,
                },
                {
                  key: "sync-media",
                  name: "Media Cache",
                  icon: <Database className="h-3.5 w-3.5 text-blue-300" />,
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
                  icon: <ShieldQuestion className="h-3.5 w-3.5 text-violet-300" />,
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
            icon: <Activity className="h-3.5 w-3.5 text-emerald-300" />,
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
            <CutoffTable instanceId={instanceId} instanceType={instance.type} enabled={selectedTab === "quality"} />
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
