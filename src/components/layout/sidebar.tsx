"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  LayoutDashboard,
  ScrollText,
  Server,
} from "lucide-react";
import { AppUpdateNotifier } from "@/components/app/app-update-notifier";
import { AccountPanel } from "@/components/auth/account-panel";
import { Logo } from "@/components/layout/logo";
import { cn } from "@/lib/utils/cn";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/instances", label: "Instances", icon: Server },
  { href: "/issues", label: "Issues", icon: AlertTriangle },
  { href: "/logs", label: "Activity Log", icon: ScrollText },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[17rem] flex-col border-r border-white/5 bg-slate-950/40 px-4 pb-4 pt-5 backdrop-blur-xl md:flex">
        <div className="app-panel-strong px-4 py-4">
          <Logo />
        </div>

        <div className="px-2 pb-2 pt-5">
          <p className="app-eyebrow">Navigation</p>
        </div>

        <nav className="flex-1 space-y-2 px-1">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group relative flex items-center gap-3 overflow-hidden rounded-2xl px-4 py-3 text-sm font-medium",
                  isActive
                    ? "border border-cyan-300/20 bg-cyan-400/10 text-white shadow-[0_14px_30px_rgba(14,165,233,0.12)]"
                    : "border border-transparent text-slate-400 hover:border-white/6 hover:bg-white/5 hover:text-slate-100",
                )}
              >
                <span
                  className={cn(
                    "absolute inset-y-2 left-1 w-1 rounded-full transition-opacity",
                    isActive ? "bg-cyan-300 opacity-100" : "bg-transparent opacity-0 group-hover:opacity-60",
                  )}
                />
                <span
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-xl border transition-colors",
                    isActive
                      ? "border-cyan-300/20 bg-cyan-300/10 text-cyan-200"
                      : "border-white/6 bg-white/5 text-slate-500 group-hover:text-slate-100",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <AppUpdateNotifier />
        <AccountPanel />
      </aside>

      <nav className="fixed inset-x-4 bottom-4 z-50 md:hidden">
        <div className="app-panel grid grid-cols-4 gap-2 px-2 py-2">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-xs font-medium",
                  isActive
                    ? "bg-cyan-400/12 text-white"
                    : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
                )}
              >
                <item.icon className={cn("h-4 w-4", isActive ? "text-cyan-200" : "")} />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
