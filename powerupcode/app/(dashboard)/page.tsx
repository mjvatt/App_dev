"use client";

import { useEffect, useState } from "react";
import { getToken } from "@/lib/auth";
import { authedRequest } from "@/lib/api";
import type { UserMe, UserProgress, Topic, Difficulty } from "@/lib/types";
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

export default function DashboardPage() {
  const [progress, setProgress] = useState<UserProgress | null>(null);
  const [me, setMe] = useState<UserMe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [resendMessage, setResendMessage] = useState("");

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    authedRequest<UserProgress>("/api/progress/me", token)
      .then(setProgress)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load progress")
      );
    authedRequest<UserMe>("/api/auth/me", token).then(setMe).catch(() => null);
  }, []);

  async function handleResend() {
    const token = getToken();
    if (!token) return;
    setResendState("sending");
    try {
      await authedRequest<{ message: string }>("/api/auth/resend-verification", token, {
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
        <p className="text-sm text-red-400">{error}</p>
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

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-8">Dashboard</h1>

      {me && !me.is_verified && (
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl px-5 py-4 mb-6 flex items-center justify-between gap-4">
          <p className="text-sm text-zinc-400">
            Your email address is not verified. Check your inbox or request a new link.
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
