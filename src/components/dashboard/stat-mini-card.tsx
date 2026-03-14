import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface StatMiniCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub: string;
  valueClassName?: string;
}

export function StatMiniCard({
  icon: Icon,
  label,
  value,
  sub,
  valueClassName,
}: StatMiniCardProps) {
  return (
    <div className="rounded-[1.1rem] border border-white/8 bg-white/[0.04] px-3 py-3">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className={cn("text-2xl font-semibold text-white", valueClassName)}>
          {value}
        </p>
        <span className="text-xs text-slate-500">{sub}</span>
      </div>
    </div>
  );
}
