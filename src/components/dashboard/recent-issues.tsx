"use client";

import { useQuery } from "@tanstack/react-query";
import { IssueCard, type IssueData } from "@/components/issues/issue-card";
import { Spinner } from "@/components/ui/spinner";

export function RecentIssues() {
  const { data, isLoading } = useQuery({
    queryKey: ["issues", "active"],
    queryFn: async () => {
      const res = await fetch("/api/issues");
      if (!res.ok) throw new Error("Failed to fetch issues");
      const json = await res.json();
      return (json.data ?? []) as IssueData[];
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

  if (!data?.length) {
    return (
      <div className="app-empty-state py-10 text-center">
        <p className="text-sm font-medium text-slate-200">No active issues</p>
        <p className="mt-2 text-sm text-slate-500">Everything looks clean across the monitored fleet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.slice(0, 10).map((issue) => (
        <IssueCard key={issue.id} issue={issue} />
      ))}
    </div>
  );
}
