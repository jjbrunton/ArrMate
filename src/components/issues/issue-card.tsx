"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, AlertCircle, Info, X } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export interface Fix {
  id: number;
  action: string;
  label: string;
  description: string | null;
  priority: number;
  automatable: boolean;
  executedAt: string | null;
}

export interface IssueData {
  id: number;
  instanceId: number;
  type: string;
  severity: string;
  title: string;
  description: string;
  status: string;
  detectedAt: string;
  fixes: Fix[];
}

interface IssueCardProps {
  issue: IssueData;
}

const severityConfig = {
  critical: {
    icon: AlertCircle,
    variant: "critical" as const,
    color: "text-rose-200",
    surface: "border-rose-300/15 bg-rose-400/10",
  },
  warning: {
    icon: AlertTriangle,
    variant: "warning" as const,
    color: "text-amber-200",
    surface: "border-amber-300/15 bg-amber-400/10",
  },
  info: {
    icon: Info,
    variant: "info" as const,
    color: "text-cyan-200",
    surface: "border-cyan-300/15 bg-cyan-400/10",
  },
};

export function IssueCard({ issue }: IssueCardProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const config = severityConfig[issue.severity as keyof typeof severityConfig] || severityConfig.info;
  const Icon = config.icon;

  const fixMutation = useMutation({
    mutationFn: async (fixId: number) => {
      const res = await fetch(`/api/issues/${issue.id}/fix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to apply fix");
      return json.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      toast({
        title: data.success ? "Fix applied" : "Action required",
        description: data.message,
        variant: data.success ? "success" : "default",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "error" });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/issues/${issue.id}/dismiss`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to dismiss");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      toast({ title: "Issue dismissed", variant: "success" });
    },
  });

  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${config.surface}`}>
            <Icon className={`h-5 w-5 ${config.color}`} />
          </div>
          <div>
            <p className="app-eyebrow">{issue.type.replace(/_/g, " ")}</p>
            <CardTitle className="mt-2 text-base">{issue.title}</CardTitle>
            <p className="mt-2 text-sm text-slate-400">{issue.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start">
          <Badge variant={config.variant}>{issue.severity}</Badge>
          <Badge>Instance {issue.instanceId}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-2">
          {issue.fixes
            .sort((a, b) => a.priority - b.priority)
            .map((fix) => (
              <Button
                key={fix.id}
                size="sm"
                variant={fix.priority === 1 ? "default" : "outline"}
                disabled={fixMutation.isPending || !!fix.executedAt}
                onClick={() => fixMutation.mutate(fix.id)}
              >
                {fix.label}
              </Button>
            ))}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => dismissMutation.mutate()}
            disabled={dismissMutation.isPending}
          >
            <X className="h-3 w-3" />
            Dismiss
          </Button>
        </div>
        <p className="mt-4 text-xs text-slate-500">
          Detected {new Date(issue.detectedAt).toLocaleString()}
        </p>
      </CardContent>
    </Card>
  );
}
