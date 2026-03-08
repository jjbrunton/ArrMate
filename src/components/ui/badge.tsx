import { cn } from "@/lib/utils/cn";
import type { HTMLAttributes } from "react";

const variants = {
  default: "border-white/10 bg-white/6 text-slate-200",
  success: "border-emerald-300/15 bg-emerald-400/10 text-emerald-200",
  warning: "border-amber-300/15 bg-amber-400/10 text-amber-200",
  critical: "border-rose-300/15 bg-rose-400/10 text-rose-200",
  info: "border-cyan-300/15 bg-cyan-400/10 text-cyan-200",
} as const;

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: keyof typeof variants;
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
