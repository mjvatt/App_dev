"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import AttemptResultPanel from "@/components/game/AttemptResultPanel";
import AuthGuard from "@/components/auth/AuthGuard";
import CodeEditor from "@/components/game/CodeEditor";
import { authedRequest } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { AttemptResult, Challenge, Difficulty } from "@/lib/types";

const LANGUAGES = ["python", "javascript", "typescript", "java"] as const;
type Language = (typeof LANGUAGES)[number];

const STARTER: Record<Language, string> = {
  python: "def solution(*args):\n    # Write your solution here\n    pass\n",
  javascript: "function solution() {\n    // Write your solution here\n}\n",
  typescript: "function solution(): void {\n    // Write your solution here\n}\n",
  java: "class Solution {\n    public void solution() {\n        // Write your solution here\n    }\n}\n",
};

const DIFFICULTY_COLOR: Record<string, string> = {
  easy: "text-green-400",
  medium: "text-yellow-400",
  hard: "text-orange-400",
  boss: "text-red-400",
};

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
  const selectedDifficultyRef = useRef<Difficulty | "">("");
  const startTime = useRef<number>(Date.now());

  const loadChallenge = useCallback(async (difficulty?: Difficulty | "") => {
    const token = getToken();
    if (!token) return;
    setFetching(true);
    setResult(null);
    setError(null);
    setHint(null);
    setHintsRemaining(3);
    setUpgradeRequired(false);
    const diff = difficulty !== undefined ? difficulty : selectedDifficultyRef.current;
    const qs = diff ? `?difficulty=${diff}` : "";
    try {
      const data = await authedRequest<Challenge>(`/api/challenges/next${qs}`, token);
      setChallenge(data);
      startTime.current = Date.now();
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
  }, []);

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
    setCode(STARTER[lang]);
  }

  async function handleHint() {
    if (!challenge) return;
    const token = getToken();
    if (!token) return;
    setHinting(true);
    try {
      const data = await authedRequest<{ hint: string; hints_remaining: number }>(
        `/api/challenges/${challenge.id}/hint`,
        token,
        { method: "POST", body: JSON.stringify({ current_attempt: code }) }
      );
      setHint(data.hint);
      setHintsRemaining(data.hints_remaining);
    } catch {
      setHint("Failed to get a hint. Please try again.");
    } finally {
      setHinting(false);
    }
  }

  async function handleSubmit() {
    if (!challenge) return;
    const token = getToken();
    if (!token) return;
    setSubmitting(true);
    setResult(null);
    const elapsed = Date.now() - startTime.current;
    try {
      const data = await authedRequest<AttemptResult>(
        `/api/challenges/${challenge.id}/attempt`,
        token,
        { method: "POST", body: JSON.stringify({ solution: code, time_ms: elapsed }) }
      );
      setResult(data);
    } catch {
      setError("Submission failed. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthGuard>
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
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-600 shrink-0">Difficulty</span>
              <select
                value={selectedDifficulty}
                onChange={(e) => handleDifficultyChange(e.target.value as Difficulty | "")}
                className="bg-zinc-950 border border-zinc-800 text-zinc-300 text-xs rounded px-2 py-1 focus:outline-none"
              >
                <option value="">Adaptive</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
                <option value="boss">Boss</option>
              </select>
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
                onClick={() => setCode(STARTER[language])}
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
                className="px-5 py-2 bg-white text-black text-sm font-semibold rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? "Running..." : "Submit"}
              </button>
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
