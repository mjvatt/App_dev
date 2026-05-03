"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import request, { ApiError } from "@/lib/api";
import type { PublicProfile, Topic } from "@/lib/types";

const TOPIC_LABELS: Record<Topic, string> = {
  arrays: "Arrays",
  strings: "Strings",
  linked_lists: "Linked Lists",
  trees: "Trees",
  graphs: "Graphs",
  dynamic_programming: "Dynamic Programming",
  system_design: "System Design",
};

interface Props {
  params: { username: string };
}

export default function PublicProfilePage({ params }: Props) {
  const { username } = params;
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);

  useEffect(() => {
    setError(null);
    setProfile(null);
    request<PublicProfile>(`/api/profiles/${encodeURIComponent(username)}`)
      .then(setProfile)
      .catch((err: unknown) => {
        if (err instanceof ApiError) {
          setError({ status: err.status, message: err.detail });
        } else {
          setError({
            status: 0,
            message: err instanceof Error ? err.message : "Failed to load profile",
          });
        }
      });
  }, [username]);

  return (
    <main className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-50 bg-black/80 backdrop-blur border-b border-zinc-900">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="text-base font-bold tracking-tight">
            PowerUpCode
          </Link>
          <Link
            href="/login"
            className="px-3 py-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Sign in
          </Link>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-10">
        {error && error.status === 404 && (
          <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-8 text-center">
            <p className="text-lg font-semibold text-white mb-2">Profile not found</p>
            <p className="text-sm text-zinc-500">
              No public profile for <span className="text-zinc-300">{username}</span>.
            </p>
          </div>
        )}

        {error && error.status !== 404 && (
          <p className="text-sm text-red-400">{error.message}</p>
        )}

        {!error && profile === null && (
          <div className="space-y-4">
            <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-6 animate-pulse">
              <div className="h-5 w-48 bg-zinc-800 rounded mb-3" />
              <div className="h-3 w-32 bg-zinc-800 rounded" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-zinc-950 border border-zinc-900 rounded-xl p-6 animate-pulse"
                >
                  <div className="h-3 w-24 bg-zinc-800 rounded mb-3" />
                  <div className="h-8 w-16 bg-zinc-800 rounded" />
                </div>
              ))}
            </div>
          </div>
        )}

        {profile && (
          <>
            <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-6 mb-6 flex items-center gap-4">
              <div className="h-14 w-14 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-xl font-bold text-zinc-300">
                {profile.username.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-xl font-bold text-white">{profile.username}</p>
                <p className="text-sm text-zinc-500">
                  Level {profile.level} · {profile.total_xp.toLocaleString()} XP
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <StreakShowcase
                label="Longest daily streak"
                tone="amber"
                value={profile.longest_daily_streak}
                current={profile.daily_streak_days}
              />
              <StreakShowcase
                label="Longest activity streak"
                tone="sky"
                value={profile.longest_streak}
                current={profile.streak_days}
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <StatCard label="Level" value={String(profile.level)} />
              <StatCard label="Total XP" value={profile.total_xp.toLocaleString()} />
              <StatCard
                label="Challenges passed"
                value={profile.challenges_passed.toLocaleString()}
              />
              <StatCard
                label="Current daily streak"
                value={`${profile.daily_streak_days}d`}
              />
            </div>

            <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-6">
              <p className="text-zinc-500 text-sm mb-4">Topics Solved</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(Object.keys(TOPIC_LABELS) as Topic[]).map((topic) => (
                  <div key={topic} className="bg-zinc-900 rounded-lg p-3">
                    <p className="text-xs text-zinc-500 mb-1">{TOPIC_LABELS[topic]}</p>
                    <p className="text-xl font-bold text-white">
                      {profile.topics[topic] ?? 0}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-6">
      <p className="text-zinc-500 text-sm mb-1">{label}</p>
      <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
    </div>
  );
}

const TONE_CLASSES: Record<"amber" | "sky", { surface: string; accent: string; ring: string }> = {
  amber: {
    surface: "from-amber-950/40 to-zinc-950 border-amber-900",
    accent: "text-amber-300",
    ring: "text-amber-400",
  },
  sky: {
    surface: "from-sky-950/40 to-zinc-950 border-sky-900",
    accent: "text-sky-300",
    ring: "text-sky-400",
  },
};

function StreakShowcase({
  label,
  tone,
  value,
  current,
}: {
  label: string;
  tone: "amber" | "sky";
  value: number;
  current: number;
}) {
  const t = TONE_CLASSES[tone];
  return (
    <div
      className={`bg-gradient-to-br ${t.surface} border rounded-xl p-6 flex items-center justify-between`}
    >
      <div className="min-w-0">
        <p className={`text-xs uppercase tracking-[0.2em] ${t.accent} mb-1`}>{label}</p>
        <p className="text-4xl font-bold text-white tabular-nums">
          {value}
          <span className="text-base text-zinc-500"> day{value === 1 ? "" : "s"}</span>
        </p>
        <p className="text-xs text-zinc-500 mt-1 tabular-nums">
          Current run: {current} day{current === 1 ? "" : "s"}
        </p>
      </div>
      <svg
        viewBox="0 0 24 24"
        className={`h-12 w-12 ${t.ring} opacity-60`}
        fill="currentColor"
        aria-hidden
      >
        <path d="M12 2c1 4 5 5 5 10a5 5 0 11-10 0c0-2 1-3 2-4-1 3 1 4 2 4 0-3-2-5 1-10z" />
      </svg>
    </div>
  );
}
