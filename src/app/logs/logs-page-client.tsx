"use client";

import { ActivityLog } from "@/components/logs/activity-log";
import { PageHero } from "@/components/layout/page-hero";

export default function LogsPage() {
  return (
    <div className="space-y-6">
      <PageHero
        title="Activity Log"
        description="Review polling runs, detections, and automated actions in chronological order."
      />
      <ActivityLog />
    </div>
  );
}
