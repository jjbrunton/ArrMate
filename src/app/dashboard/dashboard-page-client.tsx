"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpCircle } from "lucide-react";
import { DashboardSection } from "@/components/dashboard/dashboard-section";
import { StatsOverview } from "@/components/dashboard/stats-overview";
import { InstanceOverviewCards } from "@/components/dashboard/instance-overview-cards";
import { RecentMediaManagementRequests } from "@/components/dashboard/recent-media-management-requests";
import { RecentIssues } from "@/components/dashboard/recent-issues";
import { PageHero } from "@/components/layout/page-hero";

function UpdateBanner() {
  const { data } = useQuery<{ updateAvailable: boolean; latestVersion: string | null; releaseUrl: string | null }>({
    queryKey: ["app-update"],
    queryFn: () => null as never,
    enabled: false,
    staleTime: Infinity,
  });

  if (!data?.updateAvailable) return null;

  const version = data.latestVersion
    ? data.latestVersion.startsWith("v") ? data.latestVersion : `v${data.latestVersion}`
    : "new version";

  return (
    <div className="flex items-center justify-between gap-4 rounded-[var(--radius-panel)] border border-amber-300/15 bg-amber-400/8 px-5 py-3">
      <div className="flex items-center gap-3 text-sm text-amber-200">
        <ArrowUpCircle className="h-4 w-4 shrink-0" />
        <span>ArrMate {version} is available.</span>
      </div>
      {data.releaseUrl ? (
        <Link
          href={data.releaseUrl}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-medium text-amber-200 underline underline-offset-2 hover:text-amber-100"
        >
          View release
        </Link>
      ) : null}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <PageHero
        title="Dashboard"
        description="Track instance health, queue pressure, and active issues from one screen."
      />

      <StatsOverview />

      <UpdateBanner />

      <DashboardSection
        eyebrow="Instance Cadence"
        title="Scheduler clocks"
        description="Live timers and instance health for every connection."
      >
        <InstanceOverviewCards />
      </DashboardSection>

      <DashboardSection
        eyebrow="Media Management"
        title="Recent requests"
        description="Review the last upgrade-search commands ArrMate sent to Sonarr and Radarr."
      >
        <RecentMediaManagementRequests />
      </DashboardSection>

      <DashboardSection
        eyebrow="Issue Radar"
        title="Active issues"
        description="Review the newest issues first and keep the next action visible."
      >
        <RecentIssues />
      </DashboardSection>
    </div>
  );
}
