import Link from "next/link";
import AuthGuard from "@/components/auth/AuthGuard";
import StreakOverlay from "@/components/game/StreakOverlay";
import TierBadge from "@/components/game/TierBadge";

interface Mode {
  href: string | null;     // null = coming soon, no link
  title: string;
  blurb: string;
  rule: string;             // one-line rules of engagement
  badge: "Live" | "Soon";
  accent: string;           // tailwind class for the gradient stripe
}

const MODES: Mode[] = [
  {
    href: "/arcade/play",
    title: "Quick Play",
    blurb: "Pick a topic, get a fresh problem, solve it. The default loop.",
    rule: "Adaptive difficulty based on your last five attempts.",
    badge: "Live",
    accent: "from-sky-500/60 to-sky-700/30",
  },
  {
    href: "/arcade/play?daily=1",
    title: "Daily Challenge",
    blurb: "Same problem for every player. Ranked by completion time.",
    rule: "One challenge per UTC day. Solve faster, climb the daily board.",
    badge: "Live",
    accent: "from-purple-500/60 to-purple-800/30",
  },
  {
    href: "/arcade/play?review=1",
    title: "Review",
    blurb: "Spaced repetition — challenges your past self struggled on.",
    rule: "Pulls the most overdue card from your review schedule.",
    badge: "Live",
    accent: "from-amber-500/60 to-amber-700/30",
  },
  {
    href: "/arcade/boss-rush",
    title: "Boss Rush",
    blurb: "Three boss-tier problems back to back. Pass all three or wipe.",
    rule: "Three lives total. 90 / 140 / 190 XP based on outcome.",
    badge: "Live",
    accent: "from-red-500/60 to-red-800/30",
  },
  {
    href: "/interviews",
    title: "Mock Interview",
    blurb: "Solve under pressure, explain your approach, get a post-mortem.",
    rule: "One problem with a Haiku-graded debrief on a 0-100 scale.",
    badge: "Live",
    accent: "from-indigo-500/60 to-indigo-800/30",
  },
];

export default function ArcadeHubPage() {
  return (
    <AuthGuard>
      <div className="p-8 max-w-6xl">
        <div className="mb-10 flex flex-col gap-2">
          <h1 className="text-3xl font-bold text-white">Arcade</h1>
          <p className="text-sm text-zinc-400 max-w-2xl">
            Pick a mode. Each one has its own ruleset — different stakes,
            different reward, different feel.
          </p>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-zinc-500 uppercase tracking-[0.2em] mr-1">
              Worlds
            </span>
            <TierBadge difficulty="easy" size="sm" showWorld />
            <TierBadge difficulty="medium" size="sm" showWorld />
            <TierBadge difficulty="hard" size="sm" showWorld />
            <TierBadge difficulty="boss" size="sm" showWorld />
          </div>
        </div>

        <StreakOverlay />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {MODES.map((mode) => (
            <ModeTile key={mode.title} mode={mode} />
          ))}
        </div>
      </div>
    </AuthGuard>
  );
}

function ModeTile({ mode }: { mode: Mode }) {
  const live = mode.href !== null;
  const body = (
    <div
      className={`relative h-full overflow-hidden rounded-xl border ${
        live
          ? "border-zinc-800 bg-zinc-950 hover:border-white"
          : "border-zinc-900 bg-zinc-950/50"
      } transition-colors p-6 flex flex-col gap-3`}
    >
      <div
        className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${mode.accent}`}
        aria-hidden
      />
      <div className="flex items-center justify-between">
        <h2 className={`text-lg font-bold ${live ? "text-white" : "text-zinc-500"}`}>
          {mode.title}
        </h2>
        <span
          className={`text-[10px] font-semibold uppercase tracking-[0.15em] px-2 py-0.5 rounded ${
            live
              ? "bg-emerald-950/60 text-emerald-300 border border-emerald-800"
              : "bg-zinc-900 text-zinc-500 border border-zinc-800"
          }`}
        >
          {mode.badge}
        </span>
      </div>
      <p className={`text-sm ${live ? "text-zinc-300" : "text-zinc-500"}`}>
        {mode.blurb}
      </p>
      <p
        className={`text-xs ${
          live ? "text-zinc-500" : "text-zinc-600"
        } border-t border-zinc-900 pt-3 mt-auto`}
      >
        {mode.rule}
      </p>
    </div>
  );

  if (live && mode.href) {
    return (
      <Link href={mode.href} className="block h-full">
        {body}
      </Link>
    );
  }
  return body;
}
