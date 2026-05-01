"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import AuthGuard from "@/components/auth/AuthGuard";
import CodeEditor from "@/components/game/CodeEditor";
import TierBadge from "@/components/game/TierBadge";
import { authedRequest } from "@/lib/api";
import type {
  BossRushAttemptResponse,
  BossRushSession,
  Challenge,
} from "@/lib/types";

const PROBLEM_COUNT = 3;
const STARTING_LIVES = 3;

const STARTER = "def solution(*args):\n    # Boss problem — write your solution here.\n    pass\n";

interface PageParams {
  id: string;
}

export default function BossRushRunPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  // Next.js 15 makes params a Promise; React.use() unwraps in client components.
  const { id } = use(params);

  const [session, setSession] = useState<BossRushSession | null>(null);
  const [code, setCode] = useState(STARTER);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [lastPassed, setLastPassed] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<number>(() => Date.now());

  useEffect(() => {
    authedRequest<BossRushSession>(`/api/boss-rush/${id}`)
      .then((s) => {
        setSession(s);
        setStartTime(Date.now());
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load run.")
      );
  }, [id]);

  async function handleSubmit() {
    if (!session || session.status !== "in_progress" || !session.current_challenge) {
      return;
    }
    setSubmitting(true);
    setFeedback(null);
    try {
      const elapsed = Date.now() - startTime;
      const res = await authedRequest<BossRushAttemptResponse>(
        `/api/boss-rush/${id}/attempt`,
        {
          method: "POST",
          body: JSON.stringify({ solution: code, time_ms: elapsed }),
        }
      );
      setLastPassed(res.passed);
      setFeedback(res.feedback);
      // Roll the session forward locally rather than re-fetching.
      setSession((prev) =>
        prev
          ? {
              ...prev,
              status: res.status,
              current_index: res.current_index,
              lives_remaining: res.lives_remaining,
              attempts_total: res.attempts_total,
              xp_awarded: res.xp_awarded,
              current_challenge: res.next_challenge,
            }
          : prev
      );
      // Reset the editor + timer for the next problem on a pass that
      // didn't end the run; keep code in place on a fail so the player
      // can iterate.
      if (res.passed && res.status === "in_progress") {
        setCode(STARTER);
        setStartTime(Date.now());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (error) {
    return (
      <AuthGuard>
        <div className="p-8 max-w-2xl">
          <p className="text-red-400 text-sm mb-3">{error}</p>
          <Link
            href="/arcade"
            className="text-xs text-white border border-zinc-700 rounded-lg px-3 py-1.5 hover:bg-zinc-800"
          >
            Back to arcade
          </Link>
        </div>
      </AuthGuard>
    );
  }

  if (!session) {
    return (
      <AuthGuard>
        <div className="p-8 text-zinc-500 text-sm">Loading run…</div>
      </AuthGuard>
    );
  }

  if (session.status !== "in_progress") {
    return (
      <AuthGuard>
        <EndScreen session={session} />
      </AuthGuard>
    );
  }

  const challenge = session.current_challenge;
  if (!challenge) {
    return (
      <AuthGuard>
        <div className="p-8 text-zinc-500 text-sm">
          The next challenge is missing from the bank. Run state is stuck;
          start a new run.
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="flex flex-col h-screen bg-black text-white">
        <RunHeader session={session} />
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 overflow-hidden">
          <ProblemPane challenge={challenge} feedback={feedback} lastPassed={lastPassed} />
          <div className="flex flex-col border-l border-zinc-900">
            <div className="flex-1 overflow-hidden">
              <CodeEditor value={code} onChange={setCode} />
            </div>
            <div className="border-t border-zinc-900 p-3 flex items-center justify-between">
              <p className="text-xs text-zinc-500">
                Problem {session.current_index + 1} of {PROBLEM_COUNT} ·{" "}
                {session.attempts_total} attempt{session.attempts_total === 1 ? "" : "s"}
              </p>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-4 py-2 bg-white text-black text-sm font-semibold rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50"
              >
                {submitting ? "Evaluating…" : "Submit"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}

function RunHeader({ session }: { session: BossRushSession }) {
  return (
    <div className="shrink-0 border-b border-zinc-900 px-4 h-12 flex items-center justify-between bg-zinc-950">
      <div className="flex items-center gap-3">
        <Link
          href="/arcade"
          className="text-xs text-zinc-500 hover:text-white transition-colors"
        >
          ← Arcade
        </Link>
        <span className="text-sm font-bold text-red-400">Boss Rush</span>
        <span className="text-xs text-zinc-500">
          Problem {session.current_index + 1} of {PROBLEM_COUNT}
        </span>
      </div>
      <Lives remaining={session.lives_remaining} />
    </div>
  );
}

function Lives({ remaining }: { remaining: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-zinc-500 mr-1">Lives</span>
      {Array.from({ length: STARTING_LIVES }).map((_, i) => {
        const filled = i < remaining;
        return (
          <svg
            key={i}
            viewBox="0 0 24 24"
            className={`h-4 w-4 ${filled ? "text-red-400" : "text-zinc-800"}`}
            fill="currentColor"
            aria-hidden
          >
            <path d="M12 21s-7-4.35-7-10a4.5 4.5 0 018-2.8A4.5 4.5 0 0119 11c0 5.65-7 10-7 10z" />
          </svg>
        );
      })}
    </div>
  );
}

function ProblemPane({
  challenge,
  feedback,
  lastPassed,
}: {
  challenge: Challenge;
  feedback: string | null;
  lastPassed: boolean | null;
}) {
  return (
    <div className="overflow-y-auto p-6 space-y-4">
      <div className="flex items-center gap-2">
        <TierBadge difficulty={challenge.difficulty} size="sm" />
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
                <p className="text-zinc-500">in: <span className="text-zinc-200">{ex.input}</span></p>
                <p className="text-zinc-500">out: <span className="text-zinc-200">{ex.output}</span></p>
              </div>
            ))}
          </div>
        </div>
      )}
      {feedback && (
        <div
          className={`rounded-lg p-3 text-sm border ${
            lastPassed
              ? "border-emerald-800 bg-emerald-950/40 text-emerald-200"
              : "border-orange-800 bg-orange-950/40 text-orange-200"
          }`}
        >
          <p className="font-semibold mb-1">
            {lastPassed ? "Pass" : "Failed — life lost"}
          </p>
          <p className="text-xs leading-relaxed">{feedback}</p>
        </div>
      )}
    </div>
  );
}

function EndScreen({ session }: { session: BossRushSession }) {
  const completed = session.status === "completed";
  const flawless = completed && session.lives_remaining === STARTING_LIVES;
  const xp = session.xp_awarded ?? 0;
  return (
    <div className="min-h-[80vh] flex items-center justify-center p-8">
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-8 max-w-md w-full text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 mb-2">
          Boss Rush · {completed ? "Cleared" : "Wiped"}
        </p>
        <h1 className="text-3xl font-bold text-white mb-1">
          {flawless ? "FLAWLESS" : completed ? "Victory" : "Wiped"}
        </h1>
        <p className="text-sm text-zinc-400 mb-6">
          {completed
            ? "All three bosses defeated."
            : `Cleared ${session.current_index} of ${PROBLEM_COUNT} before you ran out of lives.`}
        </p>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-6">
          <p className="text-xs text-zinc-500 uppercase tracking-[0.2em]">XP earned</p>
          <p className="text-3xl font-bold text-white">+{xp}</p>
          {flawless && (
            <p className="text-xs text-emerald-400 mt-1">No-fail bonus included</p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Link
            href="/arcade/boss-rush"
            className="w-full py-2 bg-white text-black text-sm font-semibold rounded-lg hover:bg-zinc-200 transition-colors"
          >
            Run again
          </Link>
          <Link
            href="/arcade"
            className="w-full py-2 border border-zinc-700 text-white text-sm font-semibold rounded-lg hover:border-white transition-colors"
          >
            Back to arcade
          </Link>
        </div>
      </div>
    </div>
  );
}
