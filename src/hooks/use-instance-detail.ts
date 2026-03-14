"use client";

import { useQuery } from "@tanstack/react-query";
import { getInstanceDefinition, type InstanceType } from "@/lib/instances/definitions";
import type { IssueData } from "@/components/issues/issue-card";
import type { QualityCheckStrategy } from "@/lib/quality-check-strategy";

export type { IssueData };

export interface InstanceDetail {
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
  qualityCheckIntervalSeconds: number;
  qualityCheckMaxItems: number;
  qualityCheckStrategy: QualityCheckStrategy;
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

export interface JobStatus {
  running: string[];
  busy: boolean;
}

export function useInstanceDetail(instanceId: number) {
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
    refetchInterval: (query) => (query.state.data?.busy ? 1000 : 5000),
  });

  const definition = instance ? getInstanceDefinition(instance.type) : null;

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

  return { instance, isLoading, jobStatus, issues, definition };
}
