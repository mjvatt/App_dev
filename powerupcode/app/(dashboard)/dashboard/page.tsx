"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { authedRequest } from "@/lib/api";
import type {
  CurriculumResponse,
  DailyChallengeResponse,
  Difficulty,
  StreakShieldResponse,
  Topic,
  UserMe,
  UserProgress,
} from "@/lib/types";

const SHIELD_COST = 5;
const MAX_SHIELDS = 3;
import TierBadge from "@/components/game/TierBadge";
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

const DIFFICULTY_KEYS: readonly Difficulty[] = ["easy", "medium", "hard", "boss"];

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

export default function DashboardPage() {
  const [progress, setProgress] = useState<UserProgress | null>(null);
  const [me, setMe] = useState<UserMe | null>(null);
  const [daily, setDaily] = useState<DailyChallengeResponse | null>(null);
  const [curriculum, setCurriculum] = useState<CurriculumResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [resendMessage, setResendMessage] = useState("");
  const [shieldState, setShieldState] = useState<"idle" | "buying" | "error">("idle");
  const [shieldError, setShieldError] = useState<string | null>(null);

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
    authedRequest<CurriculumResponse>("/api/curriculum/me")
      .then(setCurriculum)
      .catch(() => null);
  }, [retryCount]);

  async function handleBuyShield() {
    if (!progress || shieldState === "buying") return;
    setShieldState("buying");
    setShieldError(null);
    try {
      const updated = await authedRequest<StreakShieldResponse>(
        "/api/progress/daily-streak/shield",
        { method: "POST" }
      );
      setProgress({
        ...progress,
        streak_shields: updated.streak_shields,
        token_balance: updated.token_balance,
      });
      setShieldState("idle");
    } catch (err) {
      setShieldState("error");
      setShieldError(err instanceof Error ? err.message : "Could not buy shield.");
    }
  }

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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
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
              <TierBadge difficulty={daily.challenge.difficulty} size="sm" />
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
            href="/arcade/play?daily=1"
            className="self-start md:self-auto shrink-0 px-4 py-2 bg-white text-black text-sm font-semibold rounded-lg hover:bg-zinc-200 transition-colors"
          >
            {daily.status.solved ? "Try again" : "Solve daily →"}
          </Link>
        </div>
      )}

      {curriculum && !isBrandNew && (
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-6 mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-2 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
              Recommended for you
            </p>
            <p className="text-sm text-zinc-300 leading-relaxed">
              {curriculum.rationale}
            </p>
          </div>
          <Link
            href={`/arcade/play?topic=${curriculum.weak_topic}&difficulty=${curriculum.suggested_difficulty}`}
            className="self-start md:self-auto shrink-0 px-4 py-2 border border-zinc-700 text-white text-sm font-semibold rounded-lg hover:border-white transition-colors"
          >
            Open in arcade →
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Level" value={String(progress.level)} />
        <StatCard label="Total XP" value={progress.total_xp.toLocaleString()} />
        <StatCard
          label="Current Streak"
          value={`${progress.streak_days} day${progress.streak_days !== 1 ? "s" : ""}`}
        />
        <StatCard
          label="Daily Streak"
          value={`${progress.daily_streak_days} day${progress.daily_streak_days !== 1 ? "s" : ""}`}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-gradient-to-br from-amber-950/40 to-zinc-950 border border-amber-900 rounded-xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-amber-400 mb-1">
              Power-up tokens
            </p>
            <p className="text-3xl font-bold text-white tabular-nums">
              {progress.token_balance}
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              Earn via level-ups + Boss Rush. Spend in Boss Rush.
            </p>
          </div>
          <svg
            viewBox="0 0 24 24"
            className="h-10 w-10 text-amber-300/60"
            fill="currentColor"
            aria-hidden
          >
            <path d="M13 2L3 14h7l-1 8 11-14h-7z" />
          </svg>
        </div>

        <ShieldCard
          shields={progress.streak_shields}
          tokens={progress.token_balance}
          buying={shieldState === "buying"}
          error={shieldError}
          onBuy={handleBuyShield}
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
          {DIFFICULTY_KEYS.map((key) => {
            const stats = progress.difficulty_stats[key];
            return (
              <div key={key} className="bg-zinc-900 rounded-lg p-3">
                <div className="mb-1">
                  <TierBadge difficulty={key} size="sm" />
                </div>
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

function ShieldCard({
  shields,
  tokens,
  buying,
  error,
  onBuy,
}: {
  shields: number;
  tokens: number;
  buying: boolean;
  error: string | null;
  onBuy: () => void;
}) {
  const atCap = shields >= MAX_SHIELDS;
  const canAfford = tokens >= SHIELD_COST;
  const enabled = !atCap && canAfford && !buying;
  const buttonLabel = buying
    ? "Buying…"
    : atCap
      ? "Inventory full"
      : !canAfford
        ? `Need ${SHIELD_COST} ⚡`
        : `Buy shield · ${SHIELD_COST} ⚡`;
  return (
    <div className="bg-gradient-to-br from-sky-950/40 to-zinc-950 border border-sky-900 rounded-xl p-5 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-[0.2em] text-sky-400 mb-1">
          Streak shields
        </p>
        <p className="text-3xl font-bold text-white tabular-nums">
          {shields}
          <span className="text-base text-zinc-500"> / {MAX_SHIELDS}</span>
        </p>
        <p className="text-xs text-zinc-500 mt-1">
          Auto-spent on a missed daily to keep your streak alive.
        </p>
        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
      </div>
      <div className="flex flex-col items-end gap-2 shrink-0">
        <svg
          viewBox="0 0 24 24"
          className="h-10 w-10 text-sky-300/60"
          fill="currentColor"
          aria-hidden
        >
          <path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z" />
        </svg>
        <button
          onClick={onBuy}
          disabled={!enabled}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
            enabled
              ? "border-sky-700 text-sky-200 hover:bg-sky-950/40"
              : "border-zinc-800 text-zinc-600 cursor-not-allowed"
          }`}
        >
          {buttonLabel}
        </button>
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
