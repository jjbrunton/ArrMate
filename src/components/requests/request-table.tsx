"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";

interface ImportedRequestRow {
  id: number;
  externalId: number;
  mediaType: "movie" | "tv";
  title: string;
  status: string;
  requestedByDisplayName: string;
  requestedAt: string | null;
}

function getStatusVariant(status: string): "default" | "success" | "critical" | "info" {
  if (status === "available" || status === "partially available") return "success";
  if (status === "declined" || status === "failed") return "critical";
  if (status === "processing") return "info";
  return "default";
}

function formatRequestedAt(value: string | null): string {
  if (!value) return "Unknown";
  return new Date(value).toLocaleString();
}

export function RequestTable({ instanceId }: { instanceId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["requests", instanceId],
    queryFn: async () => {
      const res = await fetch(`/api/instances/${instanceId}/requests`);
      if (!res.ok) throw new Error("Failed to fetch requests");
      const json = await res.json();
      return (json.data ?? []) as ImportedRequestRow[];
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Spinner />
      </div>
    );
  }

  if (!data?.length) {
    return (
      <div className="app-empty-state py-10 text-center text-sm text-slate-500">
        No imported requests yet
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-white/10 text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-[0.16em] text-slate-500">
            <th className="pb-3 pr-4 font-medium">Title</th>
            <th className="pb-3 pr-4 font-medium">Type</th>
            <th className="pb-3 pr-4 font-medium">Status</th>
            <th className="pb-3 pr-4 font-medium">Requested by</th>
            <th className="pb-3 font-medium">Requested at</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {data.map((request) => (
            <tr key={request.id} className="align-top">
              <td className="py-4 pr-4 text-slate-100">{request.title}</td>
              <td className="py-4 pr-4 capitalize text-slate-400">{request.mediaType}</td>
              <td className="py-4 pr-4">
                <Badge variant={getStatusVariant(request.status)}>{request.status}</Badge>
              </td>
              <td className="py-4 pr-4 text-slate-300">{request.requestedByDisplayName}</td>
              <td className="py-4 text-slate-400">{formatRequestedAt(request.requestedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
