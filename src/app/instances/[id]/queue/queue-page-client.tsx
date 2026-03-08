"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QueueTable } from "@/components/queue/queue-table";
import { PageHero } from "@/components/layout/page-hero";

export default function QueuePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/instances/${id}`}>
            <ArrowLeft className="h-4 w-4" />
            Back to instance
          </Link>
        </Button>
      </div>

      <PageHero
        title="Queue"
        description="Inspect live queue items, progress, and client state for this instance."
      />
      <section className="app-panel p-5 sm:p-6">
        <QueueTable instanceId={Number(id)} />
      </section>
    </div>
  );
}
