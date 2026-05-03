"use client";

import { useEffect, useState } from "react";
import { authedRequest } from "@/lib/api";
import type { UserProgress } from "@/lib/types";

export default function StreakOverlay() {
  const [progress, setProgress] = useState<UserProgress | null>(null);

  useEffect(() => {
    authedRequest<UserProgress>("/api/progress/me")
      .then(setProgress)
      .catch(() => null);
  }, []);

  if (!progress) return null;

  const current = progress.daily_streak_days;
  const best = Math.max(progress.longest_daily_streak, current);
  const shields = progress.streak_shields;
  const onBest = current > 0 && current === best;
  const hasShields = shields > 0;

  return (
    <div className="mb-6 rounded-xl border border-amber-900 bg-gradient-to-r from-amber-950/30 via-zinc-950 to-zinc-950 px-5 py-4 flex items-center gap-4">
      <div
        className={`relative h-11 w-11 rounded-full bg-amber-950/40 border border-amber-900 flex items-center justify-center ${
          hasShields ? "animate-pulse" : ""
        }`}
        aria-hidden
      >
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6 text-amber-300"
          fill="currentColor"
        >
          <path d="M12 2c1 4 5 5 5 10a5 5 0 11-10 0c0-2 1-3 2-4-1 3 1 4 2 4 0-3-2-5 1-10z" />
        </svg>
        {hasShields && (
          <span className="absolute -bottom-1 -right-1 text-[10px] font-bold bg-sky-900 text-sky-100 rounded-full h-4 min-w-[1rem] px-1 flex items-center justify-center border border-sky-700">
            {shields}
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-xs uppercase tracking-[0.2em] text-amber-400 mb-0.5">
          Daily streak
        </p>
        <p className="text-base font-bold text-white tabular-nums">
          {current} day{current === 1 ? "" : "s"}
          {onBest && current > 0 && (
            <span className="ml-2 text-xs font-semibold text-emerald-300 normal-case tracking-normal">
              new personal best
            </span>
          )}
        </p>
      </div>

      <div className="text-right shrink-0">
        <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Best</p>
        <p className="text-base font-bold text-zinc-200 tabular-nums">
          {best} day{best === 1 ? "" : "s"}
        </p>
      </div>
    </div>
  );
}
