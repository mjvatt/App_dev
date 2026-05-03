"use client";

import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import AuthGuard from "@/components/auth/AuthGuard";
import CodeEditor from "@/components/game/CodeEditor";
import TierBadge from "@/components/game/TierBadge";
import { authedRequest } from "@/lib/api";
import type { Difficulty, InterviewSession, UserProgress } from "@/lib/types";
import { useSpeechRecognition } from "@/lib/useSpeechRecognition";

const LANGUAGES = ["python", "javascript", "typescript", "java"] as const;
type Language = (typeof LANGUAGES)[number];

const TIME_FREEZE_COST = 5;
const FREEZE_BONUS_MS = 5 * 60_000;
const MAX_TIME_FREEZES = 3;

const STARTER: Record<Language, string> = {
  python:
    "def solution(*args):\n    # Walk me through your reasoning before you code.\n    pass\n",
  javascript:
    "function solution() {\n    // Walk me through your reasoning before you code.\n}\n",
  typescript:
    "function solution(): void {\n    // Walk me through your reasoning before you code.\n}\n",
  java:
    "class Solution {\n    public void solution() {\n        // Walk me through your reasoning before you code.\n    }\n}\n",
};

const KNOWN_DIFFICULTIES: ReadonlySet<Difficulty> = new Set([
  "easy",
  "medium",
  "hard",
  "boss",
]);

function asDifficulty(value: string | null | undefined): Difficulty | null {
  return value && KNOWN_DIFFICULTIES.has(value as Difficulty)
    ? (value as Difficulty)
    : null;
}

interface PageParams {
  id: string;
}

export default function InterviewSessionPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { id } = use(params);

  const [session, setSession] = useState<InterviewSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState(STARTER.python);
  const [language, setLanguage] = useState<Language>("python");
  const [transcript, setTranscript] = useState("");
  const [ending, setEnding] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [tokens, setTokens] = useState<number | null>(null);
  const [freezing, setFreezing] = useState(false);
  const startTime = useRef<number>(Date.now());
  // Track which stage the local code/transcript belong to so we know
  // when the active stage swaps under us and the editor needs to reset.
  const lastStageIndex = useRef<number | null>(null);
  // Re-renders once a second while the session is live so the header
  // timer stays current. Elapsed itself is derived from Date.now() at
  // render, not stored, so we don't drift.
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!session || session.status !== "in_progress") return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [session]);

  // Speech recognition appends finalized phrases to the same textarea
  // the user can also type into. One source of truth for the transcript.
  const speech = useSpeechRecognition({
    onFinalTranscript: (text) =>
      setTranscript((prev) => (prev ? `${prev} ${text}` : text)),
  });

  useEffect(() => {
    authedRequest<InterviewSession>(`/api/interviews/${id}`)
      .then((s) => {
        setSession(s);
        startTime.current = Date.now();
        lastStageIndex.current = s.current_stage_index;
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load session.")
      );
    // Best-effort: pull the user's token balance so the freeze button
    // knows what to show. Silent failure leaves the button in
    // loading-balance state.
    authedRequest<UserProgress>("/api/progress/me")
      .then((p) => setTokens(p.token_balance))
      .catch(() => null);
  }, [id]);

  // When the active stage advances under a multi-stage run, reset the
  // editor + transcript + per-stage clock so the new problem starts
  // fresh. Comparing to the ref keeps a single setState-cascade per
  // advance instead of looping on lastStageIndex updates.
  useEffect(() => {
    if (!session || !session.is_multi_stage) return;
    if (session.current_stage_index === lastStageIndex.current) return;
    lastStageIndex.current = session.current_stage_index;
    setCode(STARTER[language]);
    setTranscript("");
    startTime.current = Date.now();
  }, [session, language]);

  async function refreshTokens() {
    try {
      const p = await authedRequest<UserProgress>("/api/progress/me");
      setTokens(p.token_balance);
    } catch {
      // best-effort
    }
  }

  async function handleFreeze() {
    if (!session || freezing) return;
    setFreezing(true);
    setError(null);
    try {
      const updated = await authedRequest<InterviewSession>(
        `/api/interviews/${session.id}/time-freeze`,
        { method: "POST" }
      );
      setSession(updated);
      void refreshTokens();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not freeze time.");
    } finally {
      setFreezing(false);
    }
  }

  function handleLanguageChange(next: Language) {
    setLanguage(next);
    // Only swap the editor if it still holds an unedited starter; the
    // explicit equality check keeps any in-progress code intact.
    if (Object.values(STARTER).includes(code)) {
      setCode(STARTER[next]);
    }
  }

  async function handleEnd() {
    if (!session || ending) return;
    speech.stop();
    setEnding(true);
    setError(null);
    try {
      const elapsed = Date.now() - startTime.current;
      const updated = await authedRequest<InterviewSession>(
        `/api/interviews/${session.id}/end`,
        {
          method: "POST",
          body: JSON.stringify({
            solution: code,
            transcript,
            language,
            time_ms: elapsed,
          }),
        }
      );
      setSession(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to end session.");
    } finally {
      setEnding(false);
      setConfirming(false);
    }
  }

  async function handleAdvance() {
    if (!session || advancing || !session.is_multi_stage) return;
    speech.stop();
    setAdvancing(true);
    setError(null);
    try {
      const elapsed = Date.now() - startTime.current;
      const updated = await authedRequest<InterviewSession>(
        `/api/interviews/${session.id}/advance`,
        {
          method: "POST",
          body: JSON.stringify({
            solution: code,
            transcript,
            language,
            time_ms: elapsed,
          }),
        }
      );
      setSession(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to advance stage.");
    } finally {
      setAdvancing(false);
    }
  }

  if (error) {
    return (
      <AuthGuard>
        <div className="p-8 max-w-2xl">
          <p className="text-red-400 text-sm mb-3">{error}</p>
          <Link
            href="/interviews"
            className="text-xs text-white border border-zinc-700 rounded-lg px-3 py-1.5 hover:bg-zinc-800"
          >
            Back to interviews
          </Link>
        </div>
      </AuthGuard>
    );
  }

  if (!session) {
    return (
      <AuthGuard>
        <div className="p-8 text-zinc-500 text-sm">Loading session…</div>
      </AuthGuard>
    );
  }

  if (session.status === "completed" || session.status === "abandoned") {
    return (
      <AuthGuard>
        <ReportView session={session} />
      </AuthGuard>
    );
  }

  // in_progress
  const challenge = session.challenge;
  const tier = asDifficulty(challenge.difficulty);
  const isFinalStage =
    session.is_multi_stage &&
    session.current_stage_index !== null &&
    session.current_stage_index === session.stages.length - 1;
  const isMidRun = session.is_multi_stage && !isFinalStage;
  return (
    <AuthGuard>
      <div className="flex flex-col h-screen bg-black text-white">
        <header className="shrink-0 border-b border-zinc-900 px-4 h-12 flex items-center justify-between bg-zinc-950">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/interviews"
              className="text-xs text-zinc-500 hover:text-white transition-colors"
            >
              ← Interviews
            </Link>
            <span className="text-zinc-800">|</span>
            <span className="text-sm font-bold text-indigo-400">Mock Interview</span>
            {session.is_multi_stage && session.current_stage_index !== null && (
              <StageTracker
                currentIndex={session.current_stage_index}
                totalStages={session.stages.length}
              />
            )}
            <span className="text-zinc-800 hidden sm:inline">·</span>
            <span className="text-zinc-400 text-sm truncate hidden sm:inline">
              {challenge.title}
            </span>
            {tier && <TierBadge difficulty={tier} size="sm" />}
          </div>
          <div className="flex items-center gap-3">
            <InterviewTimer
              startedAt={startTime.current}
              freezesUsed={
                session.is_multi_stage && session.current_stage_index !== null
                  ? session.stages[session.current_stage_index]?.time_freezes_used ?? 0
                  : session.time_freezes_used
              }
            />
            <FreezeButton
              tokens={tokens}
              freezesUsed={session.time_freezes_used}
              onFreeze={handleFreeze}
              freezing={freezing}
            />
            {isMidRun ? (
              <button
                onClick={handleAdvance}
                disabled={advancing}
                className="px-3 py-1.5 bg-indigo-500 text-white text-xs font-semibold rounded-lg hover:bg-indigo-400 transition-colors disabled:opacity-50"
              >
                {advancing ? "Submitting…" : "Submit & continue"}
              </button>
            ) : (
              <button
                onClick={() => setConfirming(true)}
                className="px-3 py-1.5 border border-zinc-700 text-white text-xs font-semibold rounded-lg hover:border-white transition-colors"
              >
                {isFinalStage ? "Submit & finish" : "End interview"}
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 overflow-hidden">
          <div className="overflow-y-auto p-6 space-y-4 border-r border-zinc-900">
            <div className="flex items-center gap-2">
              {tier && <TierBadge difficulty={tier} size="sm" />}
              <span className="text-xs text-zinc-500 uppercase tracking-[0.15em]">
                {challenge.topic.replace(/_/g, " ")}
              </span>
            </div>
            <h1 className="text-xl font-bold">{challenge.title}</h1>
            <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
              {challenge.prompt}
            </p>
            {challenge.constraints.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 mb-2">
                  Constraints
                </p>
                <ul className="text-sm text-zinc-400 space-y-1">
                  {challenge.constraints.map((c, i) => (
                    <li key={i}>• {c}</li>
                  ))}
                </ul>
              </div>
            )}
            {challenge.examples.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 mb-2">
                  Examples
                </p>
                <div className="space-y-2">
                  {challenge.examples.map((ex, i) => (
                    <div
                      key={i}
                      className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-xs font-mono"
                    >
                      <p className="text-zinc-500">
                        in: <span className="text-zinc-200">{ex.input}</span>
                      </p>
                      <p className="text-zinc-500">
                        out: <span className="text-zinc-200">{ex.output}</span>
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="border-t border-zinc-900 pt-4">
              <div className="flex items-center justify-between mb-2 gap-3">
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                  Your explanation
                </p>
                {speech.supported && (
                  <button
                    onClick={speech.recording ? speech.stop : speech.start}
                    className={`text-xs font-semibold rounded-lg px-3 py-1.5 transition-colors ${
                      speech.recording
                        ? "bg-red-950/60 text-red-300 border border-red-800 hover:bg-red-900/50"
                        : "border border-zinc-700 text-white hover:border-white"
                    }`}
                  >
                    {speech.recording ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-red-400 animate-pulse" />
                        Stop
                      </span>
                    ) : (
                      "Record"
                    )}
                  </button>
                )}
              </div>
              <p className="text-xs text-zinc-600 mb-2">
                {speech.supported
                  ? "Talk through it or type — both append to the same buffer. The post-mortem grades clarity and completeness."
                  : "Type how you'd talk through it. Voice recording isn't supported in this browser."}
              </p>
              {speech.error && (
                <p className="text-xs text-red-400 mb-2">{speech.error}</p>
              )}
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                rows={6}
                placeholder="Walk through your approach: what pattern, why, how the data flows, what the complexity is…"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600 resize-y"
              />
              {speech.recording && speech.interim && (
                <p className="text-xs text-zinc-500 italic mt-2">
                  &ldquo;{speech.interim}&rdquo;
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col overflow-hidden">
            <div className="shrink-0 h-10 border-b border-zinc-900 px-3 flex items-center gap-1">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang}
                  onClick={() => handleLanguageChange(lang)}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    language === lang
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-hidden">
              <CodeEditor value={code} onChange={setCode} language={language} />
            </div>
          </div>
        </div>

        {confirming && (
          <ConfirmDialog
            disabled={ending || advancing}
            onCancel={() => setConfirming(false)}
            onConfirm={async () => {
              if (isFinalStage) {
                await handleAdvance();
                setConfirming(false);
              } else {
                await handleEnd();
              }
            }}
            ending={ending || advancing}
            mode={
              session.is_multi_stage
                ? isFinalStage
                  ? "finalize"
                  : "abandon"
                : "single"
            }
          />
        )}
      </div>
    </AuthGuard>
  );
}

// Soft target for an interview problem, in milliseconds. Roughly the
// midpoint of a typical phone-screen window — past this, the timer
// shifts to amber as a non-blocking pressure cue. The post-mortem
// also gets the raw elapsed and grades accordingly.
const INTERVIEW_TARGET_MS = 30 * 60_000;
const INTERVIEW_OVERTIME_MS = 35 * 60_000;

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function pressureColor(ms: number): string {
  if (ms >= INTERVIEW_OVERTIME_MS) return "text-red-400";
  if (ms >= INTERVIEW_TARGET_MS) return "text-amber-300";
  return "text-zinc-300";
}

function InterviewTimer({
  startedAt,
  freezesUsed,
}: {
  startedAt: number;
  freezesUsed: number;
}) {
  const elapsed = Math.max(0, Date.now() - startedAt);
  const bonus = freezesUsed * FREEZE_BONUS_MS;
  const adjustedTarget = INTERVIEW_TARGET_MS + bonus;
  const adjustedOvertime = INTERVIEW_OVERTIME_MS + bonus;
  // Pressure ramps shift right by `bonus` so each freeze meaningfully
  // delays the amber/red transitions, not just the label.
  const color =
    elapsed >= adjustedOvertime
      ? "text-red-400"
      : elapsed >= adjustedTarget
        ? "text-amber-300"
        : "text-zinc-300";
  const overtime = elapsed > adjustedTarget;
  return (
    <div className="flex flex-col items-end leading-tight">
      <span
        className={`font-mono text-sm font-semibold tabular-nums ${color}`}
      >
        {formatElapsed(elapsed)}
      </span>
      <span className="text-[10px] uppercase tracking-[0.15em] text-zinc-600">
        {overtime ? "running long" : `target ${formatElapsed(adjustedTarget)}`}
        {freezesUsed > 0 && ` · ${freezesUsed}× freeze`}
      </span>
    </div>
  );
}

function FreezeButton({
  tokens,
  freezesUsed,
  onFreeze,
  freezing,
}: {
  tokens: number | null;
  freezesUsed: number;
  onFreeze: () => void;
  freezing: boolean;
}) {
  const atCap = freezesUsed >= MAX_TIME_FREEZES;
  const canAfford = tokens !== null && tokens >= TIME_FREEZE_COST;
  const enabled = !atCap && canAfford && !freezing;
  const title = atCap
    ? `Used the maximum ${MAX_TIME_FREEZES} freezes on this session.`
    : canAfford
      ? `Spend ${TIME_FREEZE_COST} ⚡ to add 5 minutes`
      : tokens === null
        ? "Loading token balance…"
        : `Need ${TIME_FREEZE_COST} ⚡ (you have ${tokens})`;
  return (
    <button
      onClick={onFreeze}
      disabled={!enabled}
      title={title}
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
        enabled
          ? "border-amber-700 text-amber-200 hover:bg-amber-950/40"
          : "border-zinc-800 text-zinc-600 cursor-not-allowed"
      }`}
    >
      {freezing ? "Freezing…" : `+5 min · ${TIME_FREEZE_COST} ⚡`}
    </button>
  );
}

type ConfirmMode = "single" | "finalize" | "abandon";

const CONFIRM_COPY: Record<
  ConfirmMode,
  { title: string; body: string; confirm: string; busy: string }
> = {
  single: {
    title: "End the interview?",
    body:
      "Submits your final code and explanation, then synthesizes the post-mortem. This call is rate-limited and can't be undone.",
    confirm: "End and grade",
    busy: "Grading…",
  },
  finalize: {
    title: "Submit the final stage?",
    body:
      "Grades this stage and aggregates the run across all three problems. This call is rate-limited and can't be undone.",
    confirm: "Submit and grade",
    busy: "Grading…",
  },
  abandon: {
    title: "End the interview early?",
    body:
      "Abandons the run without grading the remaining stages. The session is locked but you won't get a post-mortem score.",
    confirm: "Abandon run",
    busy: "Ending…",
  },
};

function ConfirmDialog({
  disabled,
  ending,
  onCancel,
  onConfirm,
  mode,
}: {
  disabled: boolean;
  ending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  mode: ConfirmMode;
}) {
  const copy = CONFIRM_COPY[mode];
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-6 max-w-sm w-full">
        <h2 className="text-base font-semibold text-white mb-2">{copy.title}</h2>
        <p className="text-sm text-zinc-400 mb-5">{copy.body}</p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            disabled={disabled}
            className="px-4 py-2 border border-zinc-700 text-white text-sm font-semibold rounded-lg hover:border-white transition-colors disabled:opacity-50"
          >
            Keep going
          </button>
          <button
            onClick={onConfirm}
            disabled={disabled}
            className="px-4 py-2 bg-white text-black text-sm font-semibold rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50"
          >
            {ending ? copy.busy : copy.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

const STAGE_LABEL: Record<number, string> = {
  0: "Warmup",
  1: "Main",
  2: "Follow-up",
};

function StageTracker({
  currentIndex,
  totalStages,
}: {
  currentIndex: number;
  totalStages: number;
}) {
  return (
    <span className="hidden md:inline-flex items-center gap-1.5 text-xs">
      <span className="text-zinc-600 uppercase tracking-[0.15em]">
        Stage {currentIndex + 1} of {totalStages}
      </span>
      <span className="text-indigo-300 font-semibold">
        · {STAGE_LABEL[currentIndex] ?? `Stage ${currentIndex + 1}`}
      </span>
    </span>
  );
}

function ReportView({ session }: { session: InterviewSession }) {
  const tier = asDifficulty(session.challenge.difficulty);
  const score = session.overall_score ?? 0;
  const verdict = scoreVerdict(score);
  const isAbandoned = session.status === "abandoned";
  const headerTitle = session.is_multi_stage
    ? `Multi-stage interview · ${session.stages.length} stages`
    : session.challenge.title;

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-2 flex items-center gap-3">
        <Link
          href="/interviews"
          className="text-xs text-zinc-500 hover:text-white transition-colors"
        >
          ← Interviews
        </Link>
        <span className="text-zinc-800">|</span>
        <span
          className={`text-xs uppercase tracking-[0.2em] ${
            isAbandoned ? "text-zinc-500" : "text-emerald-400"
          }`}
        >
          {isAbandoned ? "Run abandoned" : "Post-mortem"}
        </span>
      </div>
      <h1 className="text-2xl font-bold text-white mb-1">{headerTitle}</h1>
      <div className="flex items-center gap-2 mb-6">
        {!session.is_multi_stage && tier && <TierBadge difficulty={tier} size="sm" />}
        {session.topic && (
          <span className="text-xs text-zinc-500 capitalize">
            {session.topic.replace(/_/g, " ")}
          </span>
        )}
      </div>

      {isAbandoned && (
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-6 mb-6">
          <p className="text-sm text-zinc-300">
            You ended the run before grading. No post-mortem was generated.
            Start a new run from the interviews page when you&apos;re ready.
          </p>
        </div>
      )}

      {!isAbandoned && (
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-6 mb-6 grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 mb-1">
            Overall score
          </p>
          <p className="text-4xl font-bold text-white">
            {score}
            <span className="text-base text-zinc-500">/100</span>
          </p>
        </div>
        {session.time_ms !== null && (
          <div className="md:text-center">
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 mb-1">
              Time taken
            </p>
            <p className={`text-2xl font-mono font-semibold tabular-nums ${pressureColor(session.time_ms)}`}>
              {formatElapsed(session.time_ms)}
            </p>
            <p className="text-[10px] uppercase tracking-[0.15em] text-zinc-600">
              {session.time_ms > INTERVIEW_TARGET_MS
                ? "over target"
                : `target ${formatElapsed(INTERVIEW_TARGET_MS)}`}
            </p>
          </div>
        )}
        <div className="md:text-right">
          <p
            className={`text-base font-semibold ${verdict.color}`}
          >
            {verdict.label}
          </p>
          <p className="text-xs text-zinc-500 mt-0.5">{verdict.note}</p>
          {session.tokens_earned > 0 && (
            <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-200 bg-amber-950/40 border border-amber-900 px-2 py-0.5 rounded-full">
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden>
                <path d="M13 2L3 14h7l-1 8 11-14h-7z" />
              </svg>
              +{session.tokens_earned}
            </p>
          )}
        </div>
      </div>
      )}

      {session.is_multi_stage && session.stages.length > 0 && !isAbandoned && (
        <StageBreakdown stages={session.stages} />
      )}

      {session.feedback && (
        <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-6 mb-6">
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 mb-3">
            Summary
          </p>
          <p className="text-sm text-zinc-200 leading-relaxed">
            {session.feedback}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <BulletCard
          title="Strengths"
          tone="emerald"
          items={session.strengths}
          empty="No strengths identified."
        />
        <BulletCard
          title="Improvements"
          tone="orange"
          items={session.improvements}
          empty="No improvements suggested."
        />
      </div>

      <div className="flex gap-2">
        <Link
          href="/interviews"
          className="px-4 py-2 border border-zinc-700 text-white text-sm font-semibold rounded-lg hover:border-white transition-colors"
        >
          Back
        </Link>
      </div>
    </div>
  );
}

function BulletCard({
  title,
  tone,
  items,
  empty,
}: {
  title: string;
  tone: "emerald" | "orange";
  items: string[];
  empty: string;
}) {
  const accent =
    tone === "emerald"
      ? "border-emerald-900 text-emerald-300"
      : "border-orange-900 text-orange-300";
  return (
    <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-5">
      <p
        className={`text-xs uppercase tracking-[0.2em] mb-3 border-b pb-2 ${accent}`}
      >
        {title}
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-zinc-600">{empty}</p>
      ) : (
        <ul className="text-sm text-zinc-200 space-y-2">
          {items.map((item, i) => (
            <li key={i} className="leading-relaxed">
              • {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StageBreakdown({ stages }: { stages: InterviewSession["stages"] }) {
  return (
    <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-6 mb-6">
      <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 mb-4">
        Per-stage breakdown
      </p>
      <div className="space-y-3">
        {stages.map((stage) => {
          const tier = asDifficulty(stage.challenge.difficulty);
          return (
            <div
              key={stage.stage_index}
              className="flex items-center gap-4 border border-zinc-900 rounded-lg p-3"
            >
              <span className="text-xs uppercase tracking-[0.15em] text-zinc-500 w-16 shrink-0">
                {STAGE_LABEL[stage.stage_index] ?? `Stage ${stage.stage_index + 1}`}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {stage.challenge.title}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  {tier && <TierBadge difficulty={tier} size="sm" />}
                  <span className="text-xs text-zinc-500 capitalize">
                    {stage.challenge.topic.replace(/_/g, " ")}
                  </span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                {stage.overall_score !== null ? (
                  <p className="text-base font-bold text-white tabular-nums">
                    {stage.overall_score}
                    <span className="text-zinc-500 text-xs">/100</span>
                  </p>
                ) : (
                  <p className="text-xs text-zinc-600">{stage.status}</p>
                )}
                {stage.time_ms !== null && (
                  <p className="text-[10px] text-zinc-600 tabular-nums">
                    {formatElapsed(stage.time_ms)}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function scoreVerdict(score: number): { label: string; note: string; color: string } {
  if (score >= 90) {
    return {
      label: "Strong hire signal",
      note: "Would interview-loop on this performance alone.",
      color: "text-emerald-400",
    };
  }
  if (score >= 70) {
    return {
      label: "Strong",
      note: "Minor gaps to close before a real loop.",
      color: "text-emerald-300",
    };
  }
  if (score >= 50) {
    return {
      label: "Pass with reservations",
      note: "Specific weaknesses are worth focused practice.",
      color: "text-amber-300",
    };
  }
  if (score >= 30) {
    return {
      label: "Did not demonstrate",
      note: "The skill isn't there yet — drill the fundamentals.",
      color: "text-orange-400",
    };
  }
  return {
    label: "Fundamental issues",
    note: "Approach or communication broke down. Re-attempt.",
    color: "text-red-400",
  };
}
