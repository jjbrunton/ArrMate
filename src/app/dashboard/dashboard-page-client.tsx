"use client";

import { StatsOverview } from "@/components/dashboard/stats-overview";
import { InstanceOverviewCards } from "@/components/dashboard/instance-overview-cards";
import { RecentMediaManagementRequests } from "@/components/dashboard/recent-media-management-requests";
import { RecentIssues } from "@/components/dashboard/recent-issues";
import { PageHero } from "@/components/layout/page-hero";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <PageHero
        title="Dashboard"
        description="Track instance health, queue pressure, and active issues from one screen."
      />

      <StatsOverview />

      <InstanceOverviewCards />

      <section className="app-panel p-5 sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <p className="app-eyebrow">Media Management</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Recent requests</h2>
          </div>
          <p className="max-w-md text-sm text-slate-400">
            Review the last upgrade-search commands ArrMate sent to Sonarr and Radarr.
          </p>
        </div>
        <RecentMediaManagementRequests />
      </section>

      <section className="app-panel p-5 sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <p className="app-eyebrow">Issue Radar</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Active issues</h2>
          </div>
          <p className="max-w-md text-sm text-slate-400">
            Review the newest issues first and keep the next action visible.
          </p>
        </div>
        <RecentIssues />
      </section>
    </div>
  );
}
