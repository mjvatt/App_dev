"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import AttemptResultPanel from "@/components/game/AttemptResultPanel";
import AuthGuard from "@/components/auth/AuthGuard";
import CodeEditor from "@/components/game/CodeEditor";
import LevelUpOverlay from "@/components/game/LevelUpOverlay";
import StreakMilestoneOverlay from "@/components/game/StreakMilestoneOverlay";
import { authedRequest } from "@/lib/api";
import { Events, track } from "@/lib/analytics";
import type { AttemptResult, Challenge, Difficulty } from "@/lib/types";

const LANGUAGES = ["python", "javascript", "typescript", "java"] as const;
type Language = (typeof LANGUAGES)[number];

const STARTER: Record<Language, string> = {
  python: "def solution(*args):\n    # Write your solution here\n    pass\n",
  javascript: "function solution() {\n    // Write your solution here\n}\n",
  typescript: "function solution(): void {\n    // Write your solution here\n}\n",
  java: "class Solution {\n    public void solution() {\n        // Write your solution here\n    }\n}\n",
};

const DRAFT_PREFIX = "puc_draft:";

function draftKey(challengeId: string, lang: Language): string {
  return `${DRAFT_PREFIX}${challengeId}:${lang}`;
}

function loadDraft(challengeId: string, lang: Language): string {
  if (typeof window === "undefined") return STARTER[lang];
  try {
    return localStorage.getItem(draftKey(challengeId, lang)) ?? STARTER[lang];
  } catch {
    return STARTER[lang];
  }
}

function saveDraft(challengeId: string, lang: Language, code: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(draftKey(challengeId, lang), code);
  } catch {
    // Storage full / private mode — drafts are best-effort.
  }
}

function clearDraft(challengeId: string, lang: Language): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(draftKey(challengeId, lang));
  } catch {
    // best-effort
  }
}

const DIFFICULTY_COLOR: Record<string, string> = {
  easy: "text-green-400",
  medium: "text-yellow-400",
  hard: "text-orange-400",
  boss: "text-red-400",
};

const DIFFICULTY_OPTIONS: { value: Difficulty | ""; label: string; color: string }[] = [
  { value: "", label: "Auto", color: "text-zinc-400" },
  { value: "easy", label: "Easy", color: "text-green-400" },
  { value: "medium", label: "Medium", color: "text-yellow-400" },
  { value: "hard", label: "Hard", color: "text-orange-400" },
  { value: "boss", label: "Boss", color: "text-red-400" },
];

export default function ArcadePage() {
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [language, setLanguage] = useState<Language>("python");
  const [code, setCode] = useState(STARTER.python);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [fetching, setFetching] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [hintsRemaining, setHintsRemaining] = useState(3);
  const [hinting, setHinting] = useState(false);
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty | "">("");
  const [levelUp, setLevelUp] = useState<{ open: boolean; level: number }>({
    open: false,
    level: 1,
  });
  const [streakMilestone, setStreakMilestone] = useState<{ open: boolean; days: number }>({
    open: false,
    days: 0,
  });
  const selectedDifficultyRef = useRef<Difficulty | "">("");
  const startTime = useRef<number>(Date.now());

  const loadChallenge = useCallback(
    async (difficulty?: Difficulty | "") => {
      setFetching(true);
      setResult(null);
      setError(null);
      setHint(null);
      setHintsRemaining(3);
      setUpgradeRequired(false);
      const diff = difficulty !== undefined ? difficulty : selectedDifficultyRef.current;
      const qs = diff ? `?difficulty=${diff}` : "";
      try {
        const data = await authedRequest<Challenge>(`/api/challenges/next${qs}`);
        setChallenge(data);
        setCode(loadDraft(data.id, language));
        startTime.current = Date.now();
        track(Events.ChallengeFetched, {
          challenge_id: data.id,
          topic: data.topic,
          difficulty: data.difficulty,
          requested_difficulty: diff || "auto",
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "";
        if (msg === "subscription_required") {
          setChallenge(null);
          setUpgradeRequired(true);
        } else {
          setError("Failed to load challenge. Check that the API is running.");
        }
      } finally {
        setFetching(false);
      }
    },
    [language]
  );

  // Persist code drafts per (challenge, language). Best-effort; throws on
  // private mode or quota are swallowed by saveDraft.
  useEffect(() => {
    if (!challenge) return;
    saveDraft(challenge.id, language, code);
  }, [challenge, language, code]);

  useEffect(() => {
    loadChallenge();
  }, [loadChallenge]);

  function handleDifficultyChange(diff: Difficulty | "") {
    selectedDifficultyRef.current = diff;
    setSelectedDifficulty(diff);
    loadChallenge(diff);
  }

  function handleLanguageChange(lang: Language) {
    setLanguage(lang);
    setCode(challenge ? loadDraft(challenge.id, lang) : STARTER[lang]);
  }

  async function handleHint() {
    if (!challenge) return;
    setHinting(true);
    try {
      const data = await authedRequest<{ hint: string; hints_remaining: number }>(
        `/api/challenges/${challenge.id}/hint`,
        { method: "POST", body: JSON.stringify({ current_attempt: code }) }
      );
      setHint(data.hint);
      setHintsRemaining(data.hints_remaining);
      track(Events.HintRequested, {
        challenge_id: challenge.id,
        difficulty: challenge.difficulty,
        hints_remaining: data.hints_remaining,
      });
    } catch {
      setHint("Failed to get a hint. Please try again.");
    } finally {
      setHinting(false);
    }
  }

  async function handleSubmit() {
    if (!challenge) return;
    setSubmitting(true);
    setResult(null);
    const elapsed = Date.now() - startTime.current;
    try {
      const data = await authedRequest<AttemptResult>(
        `/api/challenges/${challenge.id}/attempt`,
        { method: "POST", body: JSON.stringify({ solution: code, time_ms: elapsed }) }
      );
      setResult(data);
      if (data.passed) clearDraft(challenge.id, language);
      // Stagger reward overlays so they don't stack: streak first
      // (faster to dismiss), level up after if both fired this attempt.
      if (data.streak_milestone) {
        setStreakMilestone({ open: true, days: data.streak_milestone });
      } else if (data.leveled_up) {
        setLevelUp({ open: true, level: data.new_level });
      }
      track(Events.AttemptSubmitted, {
        challenge_id: challenge.id,
        topic: challenge.topic,
        difficulty: challenge.difficulty,
        language,
        passed: data.passed,
        xp_earned: data.xp_earned,
        time_ms: elapsed,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "email_verification_required") {
        track(Events.EmailVerificationBlocked, { surface: "attempt_submit" });
        setError(
          "Verify your email to submit solutions. Check your inbox or resend the link from the dashboard."
        );
      } else {
        setError("Submission failed. Try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Cmd/Ctrl + Enter submits, regardless of which pane has focus.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return;
      if (!challenge || submitting || fetching) return;
      e.preventDefault();
      handleSubmit();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // handleSubmit closes over code/challenge; rebinding on each render is cheap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challenge, submitting, fetching, code, language]);

  return (
    <AuthGuard>
      <LevelUpOverlay
        open={levelUp.open}
        newLevel={levelUp.level}
        onDismiss={() => setLevelUp((s) => ({ ...s, open: false }))}
      />
      <StreakMilestoneOverlay
        open={streakMilestone.open}
        days={streakMilestone.days}
        onDismiss={() => {
          setStreakMilestone((s) => ({ ...s, open: false }));
          // If the same attempt also leveled up, show that next.
          if (result?.leveled_up && !levelUp.open) {
            setLevelUp({ open: true, level: result.new_level });
          }
        }}
      />
      <div className="h-screen bg-black text-white flex flex-col overflow-hidden">

        {/* Header */}
        <header className="shrink-0 h-12 border-b border-zinc-900 px-5 flex items-center gap-3">
          <Link
            href="/dashboard"
            className="text-zinc-500 hover:text-white transition-colors text-sm shrink-0"
          >
            ← Dashboard
          </Link>
          <span className="text-zinc-800">|</span>
          <span className="font-semibold text-sm">Arcade</span>
          {challenge && (
            <>
              <span className="text-zinc-800 hidden sm:inline">—</span>
              <span className="text-zinc-400 text-sm truncate hidden sm:inline">{challenge.title}</span>
              <span className={`text-xs font-medium shrink-0 ${DIFFICULTY_COLOR[challenge.difficulty] ?? ""}`}>
                {challenge.difficulty}
              </span>
            </>
          )}
        </header>

        {/* Body: split pane */}
        <div className="flex-1 flex overflow-hidden">

          {/* Left pane: challenge description + result */}
          <div className="w-2/5 min-w-64 border-r border-zinc-900 overflow-y-auto p-6 flex flex-col gap-5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-zinc-600 shrink-0">Difficulty</span>
              <div className="flex items-center gap-1">
                {DIFFICULTY_OPTIONS.map(({ value, label, color }) => (
                  <button
                    key={value}
                    onClick={() => handleDifficultyChange(value)}
                    className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                      selectedDifficulty === value
                        ? `${color} bg-zinc-800`
                        : "text-zinc-600 hover:text-zinc-400"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {fetching && (
              <p className="text-zinc-600 text-sm">Loading challenge...</p>
            )}
            {error && (
              <p className="text-red-400 text-sm">{error}</p>
            )}

            {upgradeRequired && !fetching && (
              <div className="flex flex-col gap-3">
                <p className="text-sm font-semibold text-white">Unlock harder challenges</p>
                <p className="text-sm text-zinc-500">
                  Medium, hard, and boss challenges require an active subscription.
                </p>
                <Link
                  href="/billing"
                  className="self-start px-4 py-2 bg-white text-black text-sm font-semibold rounded-lg hover:bg-zinc-200 transition-colors"
                >
                  View plans
                </Link>
              </div>
            )}

            {challenge && !fetching && (
              <>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <h1 className="text-lg font-bold">{challenge.title}</h1>
                    <DifficultyBadge difficulty={challenge.difficulty} />
                  </div>
                  <p className="text-zinc-400 text-sm leading-relaxed">{challenge.prompt}</p>
                </div>

                {challenge.constraints.length > 0 && (
                  <div>
                    <SectionLabel>Constraints</SectionLabel>
                    <ul className="space-y-1 mt-1">
                      {challenge.constraints.map((c, i) => (
                        <li key={i} className="text-xs text-zinc-500">• {c}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {challenge.examples.length > 0 && (
                  <div>
                    <SectionLabel>Examples</SectionLabel>
                    <div className="space-y-2 mt-1">
                      {challenge.examples.map((ex, i) => (
                        <div
                          key={i}
                          className="bg-zinc-950 border border-zinc-900 rounded-lg p-3 text-xs font-mono space-y-1"
                        >
                          <p className="text-zinc-500">Input: <span className="text-zinc-300">{ex.input}</span></p>
                          <p className="text-zinc-500">Output: <span className="text-zinc-200">{ex.output}</span></p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {challenge && !fetching && !result && (
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleHint}
                  disabled={hinting || hintsRemaining === 0}
                  className="self-start px-3 py-1.5 border border-zinc-800 text-zinc-500 hover:text-white hover:border-zinc-600 text-xs rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {hinting
                    ? "Getting hint..."
                    : hintsRemaining === 0
                    ? "No hints left"
                    : `Hint (${hintsRemaining} left)`}
                </button>
                {hint && (
                  <p className="text-sm text-zinc-400 leading-relaxed">{hint}</p>
                )}
              </div>
            )}

            {result && (
              <AttemptResultPanel result={result} onNext={loadChallenge} />
            )}
          </div>

          {/* Right pane: code editor */}
          <div className="flex-1 flex flex-col overflow-hidden">

            {/* Toolbar */}
            <div className="shrink-0 h-10 border-b border-zinc-900 px-3 flex items-center gap-1">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang}
                  onClick={() => handleLanguageChange(lang)}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    language === lang ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {lang}
                </button>
              ))}
              <div className="flex-1" />
              <button
                onClick={() => {
                  setCode(STARTER[language]);
                  if (challenge) clearDraft(challenge.id, language);
                }}
                className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors px-2"
              >
                Reset
              </button>
            </div>

            {/* Editor */}
            <div className="flex-1 overflow-hidden">
              <CodeEditor value={code} onChange={setCode} language={language} />
            </div>

            {/* Submit footer */}
            <div className="shrink-0 border-t border-zinc-900 px-4 py-3 flex items-center gap-3">
              <button
                onClick={handleSubmit}
                disabled={submitting || !challenge || fetching}
                title="Submit (Ctrl/Cmd + Enter)"
                className="px-5 py-2 bg-white text-black text-sm font-semibold rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? "Running..." : "Submit"}
              </button>
              <span className="text-xs text-zinc-700 hidden sm:inline">⌘/Ctrl + Enter</span>
              {result && !submitting && (
                <span className={`text-sm font-medium ${result.passed ? "text-green-400" : "text-zinc-500"}`}>
                  {result.passed ? "Passed" : "Try again"}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}

function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  return (
    <span className={`text-xs font-medium ${DIFFICULTY_COLOR[difficulty] ?? "text-zinc-400"}`}>
      {difficulty}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold text-zinc-600 uppercase tracking-wider">{children}</p>
  );
}
