"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublicRoute = pathname === "/login" || pathname === "/onboarding";

  if (isPublicRoute) {
    return <main className="min-h-screen px-4 py-5 sm:px-6 md:px-8 md:py-8">{children}</main>;
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="min-h-screen pb-28 md:pl-[17rem] md:pb-0">
        <main className="px-4 py-5 sm:px-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
