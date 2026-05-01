"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import AuthGuard from "@/components/auth/AuthGuard";
import TierBadge from "@/components/game/TierBadge";
import { authedRequest } from "@/lib/api";
import type {
  Difficulty,
  InterviewHistoryResponse,
  InterviewSession,
  Topic,
} from "@/lib/types";

const TOPICS: { value: Topic; label: string }[] = [
  { value: "arrays", label: "Arrays" },
  { value: "strings", label: "Strings" },
  { value: "linked_lists", label: "Linked Lists" },
  { value: "trees", label: "Trees" },
  { value: "graphs", label: "Graphs" },
  { value: "dynamic_programming", label: "DP" },
  { value: "system_design", label: "System Design" },
];

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard", "boss"];

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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default function InterviewsLandingPage() {
  const router = useRouter();
  const [history, setHistory] = useState<InterviewHistoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty | null>(null);
  // Strict mode + dev hot-reload would otherwise post twice on the
  // start handler if a user double-taps the button.
  const startInFlight = useRef(false);

  useEffect(() => {
    authedRequest<InterviewHistoryResponse>("/api/interviews/me/history")
      .then(setHistory)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load history.")
      );
  }, []);

  async function startInterview() {
    if (startInFlight.current) return;
    startInFlight.current = true;
    setStarting(true);
    setError(null);
    try {
      const body: { topic?: Topic; difficulty?: Difficulty } = {};
      if (selectedTopic) body.topic = selectedTopic;
      if (selectedDifficulty) body.difficulty = selectedDifficulty;
      const session = await authedRequest<InterviewSession>(
        "/api/interviews/start",
        {
          method: "POST",
          body: JSON.stringify(body),
        }
      );
      router.push(`/interviews/${session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start interview.");
      startInFlight.current = false;
      setStarting(false);
    }
  }

  return (
    <AuthGuard>
      <div className="p-8 max-w-4xl">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-400 mb-2">
            Boss Lair · Mock Interview
          </p>
          <h1 className="text-3xl font-bold text-white mb-2">Run a Mock Interview</h1>
          <p className="text-sm text-zinc-400 max-w-2xl">
            One problem, no hints, your shot to talk through it like the
            real thing. End the run and Haiku grades the session across
            correctness, clarity, completeness, and communication.
          </p>
        </div>

        {error && (
          <p className="text-red-400 text-sm mb-4">{error}</p>
        )}

        <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-5 mb-10 space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 mb-2">
              Topic
            </p>
            <div className="flex flex-wrap gap-2">
              <PickerPill
                active={selectedTopic === null}
                onClick={() => setSelectedTopic(null)}
              >
                Any
              </PickerPill>
              {TOPICS.map((t) => (
                <PickerPill
                  key={t.value}
                  active={selectedTopic === t.value}
                  onClick={() =>
                    setSelectedTopic(selectedTopic === t.value ? null : t.value)
                  }
                >
                  {t.label}
                </PickerPill>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 mb-2">
              Difficulty
            </p>
            <div className="flex flex-wrap gap-2 items-center">
              <PickerPill
                active={selectedDifficulty === null}
                onClick={() => setSelectedDifficulty(null)}
              >
                Any
              </PickerPill>
              {DIFFICULTIES.map((d) => (
                <button
                  key={d}
                  onClick={() =>
                    setSelectedDifficulty(selectedDifficulty === d ? null : d)
                  }
                  className={`rounded-full transition-opacity ${
                    selectedDifficulty === d || selectedDifficulty === null
                      ? "opacity-100"
                      : "opacity-40 hover:opacity-70"
                  }`}
                >
                  <TierBadge difficulty={d} size="sm" />
                </button>
              ))}
            </div>
          </div>
          <div className="pt-2">
            <button
              onClick={startInterview}
              disabled={starting}
              className="px-5 py-3 bg-white text-black text-sm font-semibold rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50"
            >
              {starting ? "Starting…" : "Start interview"}
            </button>
            {(selectedTopic || selectedDifficulty) && (
              <button
                onClick={() => {
                  setSelectedTopic(null);
                  setSelectedDifficulty(null);
                }}
                className="ml-3 text-xs text-zinc-500 hover:text-white transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        <div>
          <h2 className="text-base font-semibold text-white mb-3">
            Recent runs
          </h2>
          {history === null && !error && (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-zinc-950 border border-zinc-900 rounded-xl p-4 animate-pulse h-16"
                />
              ))}
            </div>
          )}
          {history !== null && history.items.length === 0 && (
            <p className="text-sm text-zinc-500">
              No mock interviews yet. Run one to see it here.
            </p>
          )}
          {history !== null && history.items.length > 0 && (
            <div className="space-y-2">
              {history.items.map((item) => {
                const tier = asDifficulty(item.difficulty);
                return (
                  <Link
                    key={item.id}
                    href={`/interviews/${item.id}`}
                    className="bg-zinc-950 border border-zinc-900 rounded-xl px-5 py-4 flex items-center gap-4 hover:border-zinc-700 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {item.challenge_title ?? item.challenge_id}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {tier && <TierBadge difficulty={tier} size="sm" />}
                        {item.topic && (
                          <span className="text-xs text-zinc-500 capitalize">
                            {item.topic.replace(/_/g, " ")}
                          </span>
                        )}
                        <span
                          className={`text-xs uppercase tracking-[0.15em] px-2 py-0.5 rounded ${
                            item.status === "completed"
                              ? "bg-emerald-950/60 text-emerald-300 border border-emerald-800"
                              : item.status === "in_progress"
                                ? "bg-indigo-950/60 text-indigo-300 border border-indigo-800"
                                : "bg-zinc-900 text-zinc-500 border border-zinc-800"
                          }`}
                        >
                          {item.status === "in_progress" ? "Live" : item.status}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {item.overall_score !== null && (
                        <p className="text-base font-bold text-white">
                          {item.overall_score}
                          <span className="text-zinc-500 text-xs">/100</span>
                        </p>
                      )}
                      <p className="text-xs text-zinc-600">
                        {formatDate(item.started_at)}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AuthGuard>
  );
}

function PickerPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
        active
          ? "bg-white text-black border-white"
          : "bg-transparent text-zinc-400 border-zinc-700 hover:border-zinc-500 hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}
