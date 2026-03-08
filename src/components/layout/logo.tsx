"use client";

import Link from "next/link";
import { cn } from "@/lib/utils/cn";

interface LogoProps {
  className?: string;
}

export function Logo({ className }: LogoProps) {
  return (
    <Link
      href="/dashboard"
      aria-label="ArrMate dashboard"
      className={cn("inline-flex items-center gap-3 text-white", className)}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-300/15 bg-cyan-400/10 text-cyan-300 shadow-[0_0_32px_rgba(67,210,255,0.18)]">
        <svg
          aria-hidden="true"
          viewBox="0 0 40 40"
          className="h-5 w-5"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M7 29L14 11H18L11 29H7Z" fill="currentColor" />
          <path d="M16 29L22 14H26L20 29H16Z" fill="currentColor" opacity="0.78" />
          <path d="M24 29L30 17H34L28 29H24Z" fill="currentColor" opacity="0.48" />
        </svg>
      </span>
      <span className="text-lg font-semibold tracking-[-0.02em]">ArrMate</span>
    </Link>
  );
}
