"use client";

import confetti from "canvas-confetti";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";

interface LevelUpOverlayProps {
  open: boolean;
  newLevel: number;
  onDismiss: () => void;
}

export default function LevelUpOverlay({ open, newLevel, onDismiss }: LevelUpOverlayProps) {
  useEffect(() => {
    if (!open) return;
    // Two staggered confetti bursts feel meatier than one.
    const fire = (origin: { x: number; y: number }, particleCount: number) =>
      confetti({
        particleCount,
        spread: 70,
        startVelocity: 45,
        origin,
        colors: ["#facc15", "#fbbf24", "#fde68a", "#ffffff"],
      });
    fire({ x: 0.3, y: 0.6 }, 80);
    setTimeout(() => fire({ x: 0.7, y: 0.6 }, 80), 120);
  }, [open]);

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
            className="bg-zinc-950 border border-yellow-900 rounded-2xl p-10 text-center max-w-sm mx-6 shadow-[0_0_60px_rgba(250,204,21,0.15)]"
            onClick={(e) => e.stopPropagation()}
          >
            <motion.p
              initial={{ y: -8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.15 }}
              className="text-xs font-semibold uppercase tracking-[0.2em] text-yellow-400 mb-3"
            >
              Level Up
            </motion.p>
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 14 }}
              className="text-6xl font-bold text-white mb-2 tabular-nums"
            >
              {newLevel}
            </motion.div>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-sm text-zinc-400 mb-6"
            >
              Nice. The next tier is unlocked.
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
