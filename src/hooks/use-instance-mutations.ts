"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";
import type { JobStatus } from "./use-instance-detail";

export function useInstanceMutations(instanceId: number, jobStatus: JobStatus | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await fetch(`/api/instances/${instanceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error("Failed to update");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instances", instanceId] });
    },
  });

  const autoFixMutation = useMutation({
    mutationFn: async (autoFix: boolean) => {
      const res = await fetch(`/api/instances/${instanceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoFix }),
      });
      if (!res.ok) throw new Error("Failed to update");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instances", instanceId] });
    },
  });

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

  // Detect when background jobs complete and refresh relevant queries
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

  return {
    toggleMutation,
    autoFixMutation,
    pollMutation,
    syncMediaMutation,
    qualityCheckMutation,
    requestSyncMutation,
    dismissAllMutation,
  };
}
