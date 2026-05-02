"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { authedRequest } from "@/lib/api";
import type { AttemptResult } from "@/lib/types";

interface AttemptResultPanelProps {
  result: AttemptResult;
  challengeId: string;
  solution: string;
  language: string;
  onNext: () => void;
}

interface ReviewResponse {
  review: string;
  available: boolean;
}

export default function AttemptResultPanel({
  result,
  challengeId,
  solution,
  language,
  onNext,
}: AttemptResultPanelProps) {
  const [reviewState, setReviewState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "ready"; review: string; available: boolean }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function handleReview() {
    setReviewState({ kind: "loading" });
    try {
      const data = await authedRequest<ReviewResponse>(
        `/api/challenges/${challengeId}/review`,
        {
          method: "POST",
          body: JSON.stringify({ solution, language }),
        }
      );
      setReviewState({ kind: "ready", review: data.review, available: data.available });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Review failed.";
      setReviewState({ kind: "error", message: msg });
    }
  }

  return (
    <motion.div
      key={result.attempt_id}
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={`border rounded-xl p-5 ${
        result.passed ? "border-green-900 bg-green-950/20" : "border-zinc-800 bg-zinc-950"
      }`}
    >
      <div className="flex items-center gap-3 mb-3">
        <motion.span
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className={`text-lg font-bold ${result.passed ? "text-green-400" : "text-red-400"}`}
        >
          {result.passed ? "Passed" : "Wrong Answer"}
        </motion.span>
        {result.xp_earned > 0 && (
          <motion.span
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.18, duration: 0.3 }}
            className="text-xs font-semibold text-yellow-400 bg-yellow-950/40 border border-yellow-900 px-2 py-0.5 rounded-full"
          >
            +{result.xp_earned} XP
          </motion.span>
        )}
        {result.tokens_earned > 0 && (
          <motion.span
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.26, duration: 0.3 }}
            className="inline-flex items-center gap-1 text-xs font-semibold text-amber-200 bg-amber-950/40 border border-amber-900 px-2 py-0.5 rounded-full"
          >
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden>
              <path d="M13 2L3 14h7l-1 8 11-14h-7z" />
            </svg>
            +{result.tokens_earned}
          </motion.span>
        )}
      </div>
      <p className="text-zinc-400 text-sm leading-relaxed mb-4">{result.feedback}</p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={onNext}
          className="px-4 py-2 bg-white text-black text-sm font-semibold rounded-lg hover:bg-zinc-200 transition-colors"
        >
          Next Challenge
        </button>
        {result.passed && reviewState.kind === "idle" && (
          <button
            onClick={handleReview}
            className="px-4 py-2 border border-zinc-700 text-white text-sm font-semibold rounded-lg hover:border-white transition-colors"
          >
            Get code review
          </button>
        )}
        {reviewState.kind === "loading" && (
          <span className="text-xs text-zinc-500">Reviewing your solution…</span>
        )}
      </div>

      <AnimatePresence>
        {reviewState.kind === "ready" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="mt-5 border-t border-zinc-800 pt-4"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500 mb-3">
              Code Review
            </p>
            {reviewState.available ? (
              <div className="text-sm text-zinc-300 leading-relaxed whitespace-pre-line">
                {reviewState.review}
              </div>
            ) : (
              <p className="text-sm text-zinc-500">{reviewState.review}</p>
            )}
          </motion.div>
        )}
        {reviewState.kind === "error" && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4 text-sm text-red-400"
          >
            {reviewState.message}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
