import type { ReactNode } from "react";

interface DashboardSectionProps {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}

export function DashboardSection({
  eyebrow,
  title,
  description,
  children,
}: DashboardSectionProps) {
  return (
    <section className="app-panel p-5 sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="app-eyebrow">{eyebrow}</p>
          <h2 className="mt-2 text-xl font-semibold text-white">{title}</h2>
        </div>
        <p className="max-w-md text-sm text-slate-400">{description}</p>
      </div>
      {children}
    </section>
  );
}
