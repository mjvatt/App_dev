"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { authedRequest } from "@/lib/api";
import type {
  DailyChallengeResponse,
  Difficulty,
  Topic,
  UserMe,
  UserProgress,
} from "@/lib/types";
import XPBar from "@/components/game/XPBar";

const TOPIC_LABELS: Record<Topic, string> = {
  arrays: "Arrays",
  strings: "Strings",
  linked_lists: "Linked Lists",
  trees: "Trees",
  graphs: "Graphs",
  dynamic_programming: "Dynamic Programming",
  system_design: "System Design",
};

const XP_PER_LEVEL = 100;

const DIFFICULTIES: { key: Difficulty; label: string; color: string }[] = [
  { key: "easy", label: "Easy", color: "text-green-400" },
  { key: "medium", label: "Medium", color: "text-yellow-400" },
  { key: "hard", label: "Hard", color: "text-orange-400" },
  { key: "boss", label: "Boss", color: "text-red-400" },
];

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

const DIFFICULTY_COLOR: Record<string, string> = {
  easy: "text-green-400",
  medium: "text-yellow-400",
  hard: "text-orange-400",
  boss: "text-red-400",
};

export default function DashboardPage() {
  const [progress, setProgress] = useState<UserProgress | null>(null);
  const [me, setMe] = useState<UserMe | null>(null);
  const [daily, setDaily] = useState<DailyChallengeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [resendMessage, setResendMessage] = useState("");

  useEffect(() => {
    setError(null);
    setProgress(null);
    authedRequest<UserProgress>("/api/progress/me")
      .then(setProgress)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load progress")
      );
    authedRequest<UserMe>("/api/auth/me").then(setMe).catch(() => null);
    authedRequest<DailyChallengeResponse>("/api/challenges/daily")
      .then(setDaily)
      .catch(() => null);
  }, [retryCount]);

  async function handleResend() {
    setResendState("sending");
    try {
      await authedRequest<{ message: string }>("/api/auth/resend-verification", {
        method: "POST",
      });
      setResendState("sent");
      setResendMessage("Verification email sent. Check your inbox.");
    } catch (err) {
      setResendState("error");
      setResendMessage(err instanceof Error ? err.message : "Failed to send email");
    }
  }

  if (error) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-white mb-8">Dashboard</h1>
        <p className="text-sm text-red-400 mb-4">{error}</p>
        <button
          onClick={() => setRetryCount((n) => n + 1)}
          className="text-xs text-white border border-zinc-700 rounded-lg px-3 py-1.5 hover:bg-zinc-800 transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!progress) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-white mb-8">Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-zinc-950 border border-zinc-900 rounded-xl p-6 animate-pulse">
              <div className="h-3 w-24 bg-zinc-800 rounded mb-3" />
              <div className="h-8 w-16 bg-zinc-800 rounded" />
            </div>
          ))}
        </div>
        <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-6 mb-6 animate-pulse">
          <div className="h-3 w-32 bg-zinc-800 rounded mb-4" />
          <div className="h-2 w-full bg-zinc-800 rounded" />
        </div>
        <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-6 mb-6 animate-pulse">
          <div className="h-3 w-28 bg-zinc-800 rounded mb-4" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-zinc-900 rounded-lg p-3">
                <div className="h-2 w-12 bg-zinc-800 rounded mb-2" />
                <div className="h-6 w-8 bg-zinc-800 rounded mb-1" />
                <div className="h-2 w-16 bg-zinc-800 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const xpInLevel = XP_PER_LEVEL - progress.xp_to_next;
  const isBrandNew = progress.total_xp === 0 && progress.streak_days === 0;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-8">Dashboard</h1>

      {daily && (
        <div className="bg-gradient-to-br from-purple-950/40 to-zinc-950 border border-purple-900 rounded-xl p-6 mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-400">
                Today&apos;s Daily
              </span>
              <span
                className={`text-xs font-medium ${
                  DIFFICULTY_COLOR[daily.challenge.difficulty] ?? "text-zinc-400"
                }`}
              >
                {daily.challenge.difficulty}
              </span>
            </div>
            <p className="text-base font-semibold text-white truncate">
              {daily.challenge.title}
            </p>
            {daily.status.solved && daily.status.time_ms !== null ? (
              <p className="text-sm text-zinc-400">
                Solved in{" "}
                <span className="text-white font-semibold">
                  {formatDuration(daily.status.time_ms)}
                </span>
                {daily.status.rank !== null && (
                  <>
                    {" "}· rank{" "}
                    <span className="text-white font-semibold">#{daily.status.rank}</span>
                  </>
                )}
              </p>
            ) : (
              <p className="text-sm text-zinc-400">
                Same problem for every user. Ranked by completion time.
              </p>
            )}
          </div>
          <Link
            href="/arcade?daily=1"
            className="self-start md:self-auto shrink-0 px-4 py-2 bg-white text-black text-sm font-semibold rounded-lg hover:bg-zinc-200 transition-colors"
          >
            {daily.status.solved ? "Try again" : "Solve daily →"}
          </Link>
        </div>
      )}

      {isBrandNew && (
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl px-6 py-6 mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-1">
            <p className="text-base font-semibold text-white">Welcome to PowerUpCode</p>
            <p className="text-sm text-zinc-400">
              Solve your first challenge to earn XP, start a streak, and climb the leaderboard.
            </p>
          </div>
          <Link
            href="/arcade"
            className="self-start md:self-auto shrink-0 px-4 py-2 bg-white text-black text-sm font-semibold rounded-lg hover:bg-zinc-200 transition-colors"
          >
            Start your first challenge →
          </Link>
        </div>
      )}

      {me && !me.is_verified && (
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl px-5 py-4 mb-6 flex items-center justify-between gap-4">
          <p className="text-sm text-zinc-400">
            Verify your email to submit solutions and subscribe. Check your inbox or request a new link.
          </p>
          <div className="shrink-0">
            {resendState === "sent" || resendState === "error" ? (
              <p className={`text-xs ${resendState === "sent" ? "text-green-400" : "text-red-400"}`}>
                {resendMessage}
              </p>
            ) : (
              <button
                onClick={handleResend}
                disabled={resendState === "sending"}
                className="text-xs text-white border border-zinc-700 rounded-lg px-3 py-1.5 hover:bg-zinc-800 transition-colors disabled:opacity-50"
              >
                {resendState === "sending" ? "Sending..." : "Resend email"}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Level" value={String(progress.level)} />
        <StatCard label="Total XP" value={progress.total_xp.toLocaleString()} />
        <StatCard
          label="Current Streak"
          value={`${progress.streak_days} day${progress.streak_days !== 1 ? "s" : ""}`}
        />
      </div>

      <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-6 mb-6">
        <p className="text-zinc-500 text-sm mb-3">XP Progress</p>
        <XPBar current={xpInLevel} max={XP_PER_LEVEL} level={progress.level} />
      </div>

      <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-6 mb-4">
        <p className="text-zinc-500 text-sm mb-4">Topics Solved</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(Object.keys(TOPIC_LABELS) as Topic[]).map((topic) => (
            <div key={topic} className="bg-zinc-900 rounded-lg p-3">
              <p className="text-xs text-zinc-500 mb-1">{TOPIC_LABELS[topic]}</p>
              <p className="text-xl font-bold text-white">{progress.topics[topic] ?? 0}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-6">
        <p className="text-zinc-500 text-sm mb-4">By Difficulty</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {DIFFICULTIES.map(({ key, label, color }) => {
            const stats = progress.difficulty_stats[key];
            return (
              <div key={key} className="bg-zinc-900 rounded-lg p-3">
                <p className={`text-xs font-medium mb-1 ${color}`}>{label}</p>
                <p className="text-xl font-bold text-white">{stats?.attempts ?? 0}</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {stats ? `${Math.round(stats.pass_rate * 100)}% pass` : "No attempts"}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-6">
      <p className="text-zinc-500 text-sm mb-1">{label}</p>
      <p className="text-3xl font-bold text-white">{value}</p>
    </div>
  );
}
