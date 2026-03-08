"use client";

import { useState, useEffect } from "react";
import { Timer } from "lucide-react";

interface PollCountdownProps {
  lastPolledAt: string | null;
  pollIntervalSeconds: number;
  enabled: boolean;
}

export function PollCountdown({ lastPolledAt, pollIntervalSeconds, enabled }: PollCountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled || !lastPolledAt) return;

    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [lastPolledAt, pollIntervalSeconds, enabled]);

  const secondsLeft =
    enabled && lastPolledAt
      ? Math.max(
          0,
          Math.round(
            (new Date(lastPolledAt).getTime() + pollIntervalSeconds * 1000 - now) / 1000,
          ),
        )
      : null;

  if (!enabled) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Timer className="h-4 w-4 text-slate-400" />
        <span>Polling paused</span>
      </div>
    );
  }

  if (secondsLeft === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <Timer className="h-4 w-4 text-cyan-200" />
        <span>Waiting for first poll...</span>
      </div>
    );
  }

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const display = minutes > 0
    ? `${minutes}m ${String(seconds).padStart(2, "0")}s`
    : `${seconds}s`;

  return (
    <div className="flex items-center gap-2 text-sm text-slate-300">
      <Timer className="h-4 w-4 text-cyan-200" />
      <span>
        {secondsLeft === 0 ? "Polling now..." : `Next poll in ${display}`}
      </span>
    </div>
  );
}
