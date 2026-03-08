"use client";

import { Slot } from "@radix-ui/react-slot";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

const variants = {
  default:
    "border border-cyan-300/25 bg-[var(--accent)] text-slate-950 shadow-[0_18px_40px_rgba(14,165,233,0.2)] hover:-translate-y-0.5 hover:bg-[var(--accent-strong)] hover:text-white",
  destructive:
    "border border-rose-300/20 bg-rose-500/90 text-white shadow-[0_18px_40px_rgba(244,63,94,0.18)] hover:-translate-y-0.5 hover:bg-rose-500",
  outline:
    "border border-white/10 bg-white/5 text-slate-100 hover:border-cyan-300/20 hover:bg-cyan-400/10 hover:text-white",
  ghost:
    "border border-transparent bg-transparent text-slate-300 hover:bg-white/6 hover:text-white",
  secondary:
    "border border-white/6 bg-slate-800/80 text-slate-100 hover:-translate-y-0.5 hover:border-white/10 hover:bg-slate-700/80",
} as const;

const sizes = {
  default: "h-11 px-4 py-2 text-sm",
  sm: "h-9 px-3.5 text-xs",
  lg: "h-12 px-6 text-base",
  icon: "h-11 w-11",
} as const;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:pointer-events-none disabled:opacity-50",
          variants[variant],
          sizes[size],
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
