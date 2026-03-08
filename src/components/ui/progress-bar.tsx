import { cn } from "@/lib/utils/cn";

interface ProgressBarProps {
  value: number; // 0-100
  className?: string;
}

export function ProgressBar({ value, className }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));
  const fillClass =
    clamped === 100
      ? "from-emerald-300 via-emerald-400 to-emerald-500"
      : clamped > 50
        ? "from-cyan-300 via-sky-400 to-blue-500"
        : clamped > 20
          ? "from-amber-200 via-amber-400 to-orange-500"
          : "from-rose-200 via-rose-400 to-rose-500";

  return (
    <div
      className={cn(
        "h-2.5 w-full overflow-hidden rounded-full border border-white/6 bg-slate-950/80",
        className,
      )}
    >
      <div
        className={cn(
          "h-full rounded-full bg-gradient-to-r transition-all duration-300",
          fillClass,
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
