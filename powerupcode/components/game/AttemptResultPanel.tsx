"use client";

import { motion } from "framer-motion";
import type { AttemptResult } from "@/lib/types";

interface AttemptResultPanelProps {
  result: AttemptResult;
  onNext: () => void;
}

export default function AttemptResultPanel({ result, onNext }: AttemptResultPanelProps) {
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
      </div>
      <p className="text-zinc-400 text-sm leading-relaxed mb-4">{result.feedback}</p>
      <button
        onClick={onNext}
        className="px-4 py-2 bg-white text-black text-sm font-semibold rounded-lg hover:bg-zinc-200 transition-colors"
      >
        Next Challenge
      </button>
    </motion.div>
  );
}
