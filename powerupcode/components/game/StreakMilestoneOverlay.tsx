"use client";

import confetti from "canvas-confetti";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";

interface StreakMilestoneOverlayProps {
  open: boolean;
  days: number;
  onDismiss: () => void;
}

const COPY: Record<number, { title: string; body: string }> = {
  3: {
    title: "3-day streak",
    body: "You showed up three days in a row. The hard part of habit formation is the start.",
  },
  7: {
    title: "One week",
    body: "Seven straight days. You're outpacing the average user by a wide margin.",
  },
  14: {
    title: "Two weeks",
    body: "Fourteen days in a row. New neural connections are starting to stick.",
  },
  30: {
    title: "One month",
    body: "A full month. Whatever motivated you on day one is now muscle memory.",
  },
  60: {
    title: "Two months",
    body: "Sixty days. You've put in more focused practice than most engineers do in a year.",
  },
  100: {
    title: "100 days",
    body: "A hundred-day streak. There's a very small club of people at this level.",
  },
  365: {
    title: "One full year",
    body: "365 days. Take a screenshot. You earned this.",
  },
};

export default function StreakMilestoneOverlay({
  open,
  days,
  onDismiss,
}: StreakMilestoneOverlayProps) {
  useEffect(() => {
    if (!open) return;
    // Warm orange-flame palette to differentiate from the level-up gold.
    const fire = (origin: { x: number; y: number }, particleCount: number) =>
      confetti({
        particleCount,
        spread: 80,
        startVelocity: 50,
        origin,
        colors: ["#f97316", "#fb923c", "#fdba74", "#ffffff"],
      });
    fire({ x: 0.25, y: 0.65 }, 90);
    setTimeout(() => fire({ x: 0.75, y: 0.65 }, 90), 140);
  }, [open]);

  const copy = COPY[days] ?? {
    title: `${days}-day streak`,
    body: "Keep the chain alive. Tomorrow, again.",
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={onDismiss}
        >
          <motion.div
            initial={{ scale: 0.7, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="bg-zinc-950 border border-orange-900 rounded-2xl p-10 text-center max-w-sm mx-6 shadow-[0_0_60px_rgba(249,115,22,0.18)]"
            onClick={(e) => e.stopPropagation()}
          >
            <motion.p
              initial={{ y: -8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.15 }}
              className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-400 mb-3"
            >
              Streak milestone
            </motion.p>
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 14 }}
              className="text-5xl font-bold text-white mb-3 tabular-nums"
            >
              {copy.title}
            </motion.div>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-sm text-zinc-400 mb-6 leading-relaxed"
            >
              {copy.body}
            </motion.p>
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              onClick={onDismiss}
              className="px-6 py-2 bg-white text-black text-sm font-semibold rounded-lg hover:bg-zinc-200 transition-colors"
            >
              Keep going
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
