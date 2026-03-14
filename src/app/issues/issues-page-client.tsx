"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, ShieldCheck } from "lucide-react";
import { IssueCard, type IssueData } from "@/components/issues/issue-card";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { PageHero } from "@/components/layout/page-hero";

export default function IssuesPage() {
  const [severityFilter, setSeverityFilter] = useState("all");
  const [showResolved, setShowResolved] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["issues", showResolved ? "all" : "active"],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (showResolved) params.set("all", "true");
      const res = await fetch(`/api/issues?${params}`);
      if (!res.ok) throw new Error("Failed to fetch issues");
      const json = await res.json();
      return (json.data ?? []) as IssueData[];
    },
    refetchInterval: 30_000,
  });

  const filtered = data?.filter((issue) =>
    severityFilter === "all" ? true : issue.severity === severityFilter,
  );

  const hasAutomatableFixes = data?.some(
    (issue) =>
      issue.status === "active" &&
      issue.fixes.some((f) => f.automatable && !f.executedAt),
  );

  const acceptAllMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/issues/accept-all", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to accept fixes");
      return json.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      toast({
        title: "Automated fixes applied",
        description: `${data.succeeded}/${data.executed} fixes applied successfully`,
        variant: data.succeeded === data.executed ? "success" : "default",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "error" });
    },
  });

  return (
    <div className="space-y-6">
      <PageHero
        title="Issues"
        description="Review queue problems, filter by severity, and apply fixes without losing context."
        meta={
          <>
            <div className="app-stat-chip">
              <span className="app-status-dot bg-cyan-300 text-cyan-300" />
              {filtered?.length ?? 0} issue{(filtered?.length ?? 0) !== 1 ? "s" : ""}
            </div>
            {data?.filter((i) => i.severity === "critical").length ? (
              <Badge variant="critical">
                {data.filter((i) => i.severity === "critical").length} critical
              </Badge>
            ) : null}
            {data?.filter((i) => i.severity === "warning").length ? (
              <Badge variant="warning">
                {data.filter((i) => i.severity === "warning").length} warning
              </Badge>
            ) : null}
          </>
        }
        actions={
          hasAutomatableFixes ? (
            <Button
              size="sm"
              disabled={acceptAllMutation.isPending}
              onClick={() => acceptAllMutation.mutate()}
            >
              <CheckCheck className="h-4 w-4" />
              {acceptAllMutation.isPending ? "Applying..." : "Accept automated fixes"}
            </Button>
          ) : null
        }
      />

      <section className="app-panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <p className="app-eyebrow">Filters</p>
          <p className="mt-2 text-sm text-slate-400">
            Tight controls keep the operator focused without hiding context.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="info">Info</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={() => setShowResolved(!showResolved)}>
            {showResolved ? "Hide resolved" : "Show resolved"}
          </Button>
        </div>
      </section>

      {isLoading ? (
        <div className="app-panel flex items-center justify-center py-16">
          <Spinner />
        </div>
      ) : !filtered?.length ? (
        <div className="app-empty-state flex flex-col items-center gap-4 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-300/15 bg-emerald-400/10">
            <ShieldCheck className="h-6 w-6 text-emerald-300" />
          </div>
          <div>
            <p className="text-base font-medium text-slate-100">All clear</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
              No issues detected across your instances. Problems will appear here when they arise.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((issue) => (
            <IssueCard key={issue.id} issue={issue} />
          ))}
        </div>
      )}
    </div>
  );
}
