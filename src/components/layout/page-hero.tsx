import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

interface PageHeroProps {
  kicker?: string;
  title: string;
  description: string;
  actions?: ReactNode;
  meta?: ReactNode;
  className?: string;
}

export function PageHero({
  kicker,
  title,
  description,
  actions,
  meta,
  className,
}: PageHeroProps) {
  return (
    <section
      className={cn(
        "border-b border-white/8 pb-5 sm:pb-6",
        className,
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="space-y-2">
            {kicker ? <p className="app-eyebrow text-cyan-200">{kicker}</p> : null}
            <h1 className="text-[2rem] font-semibold leading-none text-white sm:text-[2.4rem]">
              {title}
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-slate-400 sm:text-[0.95rem]">
              {description}
            </p>
          </div>
          {meta ? <div className="flex flex-wrap gap-2.5">{meta}</div> : null}
        </div>

        {actions ? (
          <div className="flex flex-wrap items-center gap-3 lg:justify-end">{actions}</div>
        ) : null}
      </div>
    </section>
  );
}
