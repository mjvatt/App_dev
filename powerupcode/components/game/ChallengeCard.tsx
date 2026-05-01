import type { Challenge } from "@/lib/types";
import TierBadge from "@/components/game/TierBadge";

interface ChallengeCardProps {
  challenge: Challenge;
  onStart?: (challenge: Challenge) => void;
}

export default function ChallengeCard({ challenge, onStart }: ChallengeCardProps) {
  return (
    <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-6 flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-3">
        <h2 className="text-base font-semibold text-white leading-snug">{challenge.title}</h2>
        <TierBadge difficulty={challenge.difficulty} size="sm" />
      </div>

      <p className="text-zinc-400 text-sm leading-relaxed mb-4 flex-1">{challenge.prompt}</p>

      {challenge.constraints.length > 0 && (
        <ul className="mb-4 space-y-1">
          {challenge.constraints.map((c, i) => (
            <li key={i} className="text-xs text-zinc-600">
              • {c}
            </li>
          ))}
        </ul>
      )}

      {onStart && (
        <button
          onClick={() => onStart(challenge)}
          className="mt-auto px-4 py-2 bg-white text-black text-sm font-semibold rounded-lg hover:bg-zinc-200 transition-colors"
        >
          Start
        </button>
      )}
    </div>
  );
}
