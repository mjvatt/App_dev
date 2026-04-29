"use client";

import confetti from "canvas-confetti";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";

interface BossDefeatedOverlayProps {
  open: boolean;
  challengeTitle: string;
  xpEarned: number;
  onDismiss: () => void;
}

export default function BossDefeatedOverlay({
  open,
  challengeTitle,
  xpEarned,
  onDismiss,
}: BossDefeatedOverlayProps) {
  useEffect(() => {
    if (!open) return;
    // Boss kill gets the loudest celebration: red-purple cannon
    // from below + a delayed gold shower from above.
    confetti({
      particleCount: 140,
      spread: 90,
      startVelocity: 60,
      angle: 90,
      origin: { x: 0.5, y: 1 },
      colors: ["#dc2626", "#a855f7", "#f43f5e", "#facc15", "#ffffff"],
    });
    setTimeout(() => {
      confetti({
        particleCount: 80,
        spread: 120,
        startVelocity: 35,
        gravity: 0.6,
        origin: { x: 0.5, y: 0 },
        colors: ["#facc15", "#fde68a", "#ffffff"],
      });
    }, 250);
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={onDismiss}
        >
          <motion.div
            initial={{ scale: 0.7, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="bg-zinc-950 border border-red-900 rounded-2xl p-10 text-center max-w-md mx-6 shadow-[0_0_80px_rgba(220,38,38,0.25)]"
            onClick={(e) => e.stopPropagation()}
          >
            <motion.p
              initial={{ y: -8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.15 }}
              className="text-xs font-semibold uppercase tracking-[0.25em] text-red-400 mb-3"
            >
              Boss Defeated
            </motion.p>
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 14 }}
              className="text-3xl font-bold text-white mb-2 leading-tight"
            >
              {challengeTitle}
            </motion.div>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.35 }}
              className="text-sm text-zinc-400 mb-6"
            >
              You took down a boss-tier challenge. The hardest tier in the game.
            </motion.p>
            {xpEarned > 0 && (
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.45, type: "spring", stiffness: 220, damping: 16 }}
                className="inline-block px-4 py-2 mb-6 text-sm font-bold text-yellow-300 bg-yellow-950/40 border border-yellow-900 rounded-full"
              >
                +{xpEarned} XP
              </motion.div>
            )}
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.55 }}
              onClick={onDismiss}
              className="block w-full px-6 py-2 bg-white text-black text-sm font-semibold rounded-lg hover:bg-zinc-200 transition-colors"
            >
              Continue
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
