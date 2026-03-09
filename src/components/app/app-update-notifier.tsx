"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpCircle, ExternalLink, Package, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

interface AppUpdateStatus {
  currentVersion: string;
  currentCommitSha: string | null;
  releaseRepository: string;
  latestVersion: string | null;
  latestReleaseTag: string | null;
  updateAvailable: boolean;
  publishedAt: string | null;
  releaseUrl: string | null;
  changelog: string | null;
  checkedAt: string;
  error: string | null;
}

function formatVersion(value: string | null) {
  if (!value) {
    return "Unknown";
  }

  return value.startsWith("v") ? value : `v${value}`;
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getSummary(status: AppUpdateStatus | undefined) {
  if (!status) {
    return "Checking GitHub releases";
  }

  if (status.error) {
    return status.error;
  }

  if (status.updateAvailable) {
    return `${formatVersion(status.latestVersion)} is ready to install.`;
  }

  return "The installed build matches the latest published release.";
}

function ChangelogDialog({
  status,
  open,
  onOpenChange,
}: {
  status: AppUpdateStatus;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const title = status.updateAvailable
    ? `What's new in ${formatVersion(status.latestVersion)}`
    : `Latest release ${formatVersion(status.latestVersion ?? status.currentVersion)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Published {formatTimestamp(status.publishedAt)} from {status.releaseRepository}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto pr-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[1rem] border border-white/8 bg-white/4 p-4">
              <p className="app-eyebrow">Installed</p>
              <p className="mt-2 text-lg font-semibold text-white">{formatVersion(status.currentVersion)}</p>
            </div>
            <div className="rounded-[1rem] border border-white/8 bg-white/4 p-4">
              <p className="app-eyebrow">Latest</p>
              <p className="mt-2 text-lg font-semibold text-white">
                {formatVersion(status.latestVersion ?? status.currentVersion)}
              </p>
            </div>
          </div>

          <div className="rounded-[1rem] border border-white/8 bg-slate-950/55 p-4">
            <p className="app-eyebrow">Release Notes</p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-300">
              {status.changelog ?? "No release notes were published for this release."}
            </p>
          </div>

          {status.releaseUrl ? (
            <Button asChild variant="outline" className="w-full justify-center">
              <Link href={status.releaseUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                Open on GitHub
              </Link>
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AppUpdateNotifier({ variant = "compact" }: { variant?: "compact" | "full" }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["app-update"],
    queryFn: async () => {
      const response = await fetch("/api/app/update");

      if (!response.ok) {
        throw new Error("Failed to fetch update status");
      }

      const payload = await response.json() as { data: AppUpdateStatus };
      return payload.data;
    },
    staleTime: 60 * 60 * 1000,
  });

  const badgeVariant = data?.error ? "default" : data?.updateAvailable ? "warning" : "success";
  const badgeLabel = data?.error ? "Release check unavailable" : data?.updateAvailable ? "Update available" : "Up to date";
  const canOpenChangelog = Boolean(data?.latestVersion || data?.changelog || data?.releaseUrl);

  if (variant === "full") {
    return (
      <>
        <Card className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-300/15 bg-cyan-400/10 text-cyan-200">
                  <Package className="h-5 w-5" />
                </span>
                <div>
                  <p className="app-eyebrow">Release Tracker</p>
                  <CardTitle className="mt-1">Application updates</CardTitle>
                </div>
              </div>
              <p className="max-w-2xl text-sm text-slate-400">{getSummary(data)}</p>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant={badgeVariant}>{badgeLabel}</Badge>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void refetch()}
                disabled={isFetching}
              >
                <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="flex items-center gap-3 text-sm text-slate-400">
                <Spinner />
                <span>Checking GitHub releases...</span>
              </div>
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-[1rem] border border-white/8 bg-white/4 p-4">
                    <p className="app-eyebrow">Installed</p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {formatVersion(data?.currentVersion ?? null)}
                    </p>
                  </div>
                  <div className="rounded-[1rem] border border-white/8 bg-white/4 p-4">
                    <p className="app-eyebrow">Latest</p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {formatVersion(data?.latestVersion ?? data?.currentVersion ?? null)}
                    </p>
                  </div>
                  <div className="rounded-[1rem] border border-white/8 bg-white/4 p-4">
                    <p className="app-eyebrow">Checked</p>
                    <p className="mt-2 text-sm font-medium text-slate-200">
                      {formatTimestamp(data?.checkedAt ?? null)}
                    </p>
                  </div>
                </div>

                <div className="rounded-[1rem] border border-white/8 bg-slate-950/55 p-4">
                  <p className="app-eyebrow">Latest release notes</p>
                  <p className="mt-3 line-clamp-6 whitespace-pre-wrap text-sm leading-6 text-slate-300">
                    {data?.changelog ?? "No release notes were published for the latest release."}
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  {canOpenChangelog ? (
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(true)}>
                      <ArrowUpCircle className="h-4 w-4" />
                      View changelog
                    </Button>
                  ) : null}
                  {data?.releaseUrl ? (
                    <Button asChild type="button" variant="ghost">
                      <Link href={data.releaseUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-4 w-4" />
                        Open release
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {data && canOpenChangelog ? (
          <ChangelogDialog status={data} open={dialogOpen} onOpenChange={setDialogOpen} />
        ) : null}
      </>
    );
  }

  return (
    <>
      <div className="app-panel-muted mt-4 space-y-3 px-3 py-3">
        <div className="flex items-center gap-3 px-1">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">
            <Package className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium text-white">ArrMate</p>
              <Badge variant={badgeVariant} className="px-2 py-0.5 text-[10px]">
                {data?.updateAvailable ? "New" : data?.error ? "Retry later" : "Current"}
              </Badge>
            </div>
            <p className="truncate text-xs text-slate-400">
              {isLoading ? "Checking releases" : getSummary(data)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 px-1">
          <div className="rounded-[0.95rem] border border-white/8 bg-white/4 px-3 py-2">
            <p className="app-eyebrow">Installed</p>
            <p className="mt-1 text-sm font-medium text-white">{formatVersion(data?.currentVersion ?? null)}</p>
          </div>
          <div className="rounded-[0.95rem] border border-white/8 bg-white/4 px-3 py-2">
            <p className="app-eyebrow">Latest</p>
            <p className="mt-1 text-sm font-medium text-white">
              {formatVersion(data?.latestVersion ?? data?.currentVersion ?? null)}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="flex-1"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => setDialogOpen(true)}
            disabled={!canOpenChangelog}
          >
            <ArrowUpCircle className="h-4 w-4" />
            Changelog
          </Button>
        </div>
      </div>

      {data && canOpenChangelog ? (
        <ChangelogDialog status={data} open={dialogOpen} onOpenChange={setDialogOpen} />
      ) : null}
    </>
  );
}
