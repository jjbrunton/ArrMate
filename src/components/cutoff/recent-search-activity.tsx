"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { QualitySearchBatch } from "@/lib/services/quality-service";
import { formatTimestamp, formatSearchSource } from "./utils";

interface RecentSearchActivityProps {
  searches: QualitySearchBatch[];
}

export function RecentSearchActivity({ searches }: RecentSearchActivityProps) {
  const [open, setOpen] = useState(false);
  const Icon = open ? ChevronDown : ChevronRight;

  return (
    <section className="app-panel-muted overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-white/3"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-slate-500" />
          <span className="text-sm font-medium text-slate-300">Recent Search Activity</span>
          <span className="text-xs text-slate-500">
            ({searches.length} batch{searches.length === 1 ? "" : "es"})
          </span>
        </div>
      </button>

      {open && (
        <div className="border-t border-white/8 px-5 pb-5 pt-4">
          {searches.length === 0 ? (
            <p className="text-sm text-slate-400">
              No upgrade searches have been sent for this instance yet.
            </p>
          ) : (
            <div className="space-y-3">
              {searches.map((batch, index) => (
                <div key={`${batch.createdAt}-${index}`} className="rounded-2xl border border-white/8 bg-white/3 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={batch.source === "user" ? "info" : "default"}>
                        {formatSearchSource(batch.source)}
                      </Badge>
                      <p className="text-sm text-slate-200">
                        {batch.requestedCount} item{batch.requestedCount === 1 ? "" : "s"} searched
                      </p>
                    </div>
                    <p className="text-xs text-slate-500">{formatTimestamp(batch.createdAt)}</p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {batch.items.map((item) => (
                      <span
                        key={`${batch.createdAt}-${item.id}`}
                        className="rounded-full border border-cyan-400/20 bg-cyan-400/8 px-3 py-1 text-xs text-cyan-100"
                      >
                        {item.label}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
