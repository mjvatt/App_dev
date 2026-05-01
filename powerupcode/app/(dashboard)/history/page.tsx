"use client";

import { useEffect, useState } from "react";
import TierBadge from "@/components/game/TierBadge";
import { authedRequest } from "@/lib/api";
import type { Difficulty } from "@/lib/types";

interface AttemptHistoryItem {
  attempt_id: string;
  challenge_id: string;
  challenge_title: string | null;
  topic: string | null;
  difficulty: string | null;
  passed: boolean;
  xp_earned: number;
  hints_used: number;
  time_ms: number;
  submitted_at: string;
}

const KNOWN_DIFFICULTIES: ReadonlySet<Difficulty> = new Set([
  "easy",
  "medium",
  "hard",
  "boss",
]);

function asDifficulty(value: string | null): Difficulty | null {
  return value !== null && KNOWN_DIFFICULTIES.has(value as Difficulty)
    ? (value as Difficulty)
    : null;
}

function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function HistoryPage() {
  const [items, setItems] = useState<AttemptHistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authedRequest<{ items: AttemptHistoryItem[] }>("/api/progress/history")
      .then((data) => setItems(data.items))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load history")
      );
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-8">History</h1>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {items === null && !error && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="bg-zinc-950 border border-zinc-900 rounded-xl p-4 animate-pulse"
            >
              <div className="h-3 w-48 bg-zinc-800 rounded mb-2" />
              <div className="h-3 w-32 bg-zinc-800 rounded" />
            </div>
          ))}
        </div>
      )}

      {items !== null && items.length === 0 && (
        <p className="text-zinc-500 text-sm">
          No attempts yet. Head to the arcade to get started.
        </p>
      )}

      {items !== null && items.length > 0 && (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.attempt_id}
              className="bg-zinc-950 border border-zinc-900 rounded-xl px-5 py-4 flex items-center gap-4"
            >
              <span
                className={`shrink-0 h-2 w-2 rounded-full ${
                  item.passed ? "bg-green-400" : "bg-red-400"
                }`}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {item.challenge_title ?? item.challenge_id}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  {item.topic && (
                    <span className="text-xs text-zinc-500 capitalize">
                      {item.topic.replace(/_/g, " ")}
                    </span>
                  )}
                  {asDifficulty(item.difficulty) && (
                    <TierBadge
                      difficulty={asDifficulty(item.difficulty)!}
                      size="sm"
                    />
                  )}
                </div>
              </div>
              <div className="shrink-0 text-right space-y-0.5">
                {item.xp_earned > 0 && (
                  <p className="text-xs font-semibold text-yellow-400">+{item.xp_earned} XP</p>
                )}
                <p className="text-xs text-zinc-600">{formatTime(item.time_ms)}</p>
              </div>
              <p className="shrink-0 text-xs text-zinc-600 w-14 text-right">
                {formatDate(item.submitted_at)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
