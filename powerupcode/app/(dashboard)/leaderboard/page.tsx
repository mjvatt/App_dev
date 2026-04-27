"use client";

import { useEffect, useState } from "react";
import { authedRequest } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { LeaderboardEntry, LeaderboardResponse } from "@/lib/types";

const RANK_COLOR: Record<number, string> = {
  1: "text-yellow-400",
  2: "text-zinc-300",
  3: "text-orange-400",
};

function rankColor(rank: number): string {
  return RANK_COLOR[rank] ?? "text-zinc-600";
}

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    authedRequest<LeaderboardResponse>("/api/leaderboard", token)
      .then((data) => setEntries(data.entries))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load leaderboard")
      );
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-8">Leaderboard</h1>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {entries === null && !error && (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="bg-zinc-950 border border-zinc-900 rounded-xl p-4 animate-pulse"
            >
              <div className="h-3 w-40 bg-zinc-800 rounded mb-2" />
              <div className="h-3 w-24 bg-zinc-800 rounded" />
            </div>
          ))}
        </div>
      )}

      {entries !== null && entries.length === 0 && (
        <p className="text-zinc-500 text-sm">No players on the board yet.</p>
      )}

      {entries !== null && entries.length > 0 && (
        <>
          <div className="hidden md:grid grid-cols-[3rem_1fr_5rem_7rem_5rem] gap-4 px-5 mb-2">
            <span className="text-xs text-zinc-600 font-medium">#</span>
            <span className="text-xs text-zinc-600 font-medium">Player</span>
            <span className="text-xs text-zinc-600 font-medium text-right">Level</span>
            <span className="text-xs text-zinc-600 font-medium text-right">XP</span>
            <span className="text-xs text-zinc-600 font-medium text-right">Streak</span>
          </div>

          <div className="space-y-1.5">
            {entries.map((entry) => (
              <div
                key={entry.rank}
                className={`rounded-xl px-5 py-4 grid grid-cols-[3rem_1fr] md:grid-cols-[3rem_1fr_5rem_7rem_5rem] gap-4 items-center border ${
                  entry.is_current_user
                    ? "bg-zinc-900 border-zinc-700"
                    : "bg-zinc-950 border-zinc-900"
                }`}
              >
                <span className={`text-sm font-bold tabular-nums ${rankColor(entry.rank)}`}>
                  {entry.rank}
                </span>

                <div className="min-w-0">
                  <span
                    className={`text-sm font-medium truncate block ${
                      entry.is_current_user ? "text-white" : "text-zinc-300"
                    }`}
                  >
                    {entry.username}
                    {entry.is_current_user && (
                      <span className="ml-2 text-xs text-zinc-500 font-normal">you</span>
                    )}
                  </span>
                  <span className="md:hidden text-xs text-zinc-500 mt-0.5 block tabular-nums">
                    Lv {entry.level} · {entry.total_xp.toLocaleString()} XP · {entry.streak_days}d
                  </span>
                </div>

                <span className="hidden md:block text-sm text-zinc-400 text-right tabular-nums">
                  Lv {entry.level}
                </span>

                <span className="hidden md:block text-sm font-semibold text-yellow-400 text-right tabular-nums">
                  {entry.total_xp.toLocaleString()} XP
                </span>

                <span className="hidden md:block text-sm text-zinc-500 text-right tabular-nums">
                  {entry.streak_days}d
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
