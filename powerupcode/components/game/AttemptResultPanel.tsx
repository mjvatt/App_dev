import type { AttemptResult } from "@/lib/types";

interface AttemptResultPanelProps {
  result: AttemptResult;
  onNext: () => void;
}

export default function AttemptResultPanel({ result, onNext }: AttemptResultPanelProps) {
  return (
    <div
      className={`border rounded-xl p-5 ${
        result.passed ? "border-green-900 bg-green-950/20" : "border-zinc-800 bg-zinc-950"
      }`}
    >
      <div className="flex items-center gap-3 mb-3">
        <span className={`text-lg font-bold ${result.passed ? "text-green-400" : "text-red-400"}`}>
          {result.passed ? "Passed" : "Wrong Answer"}
        </span>
        {result.xp_earned > 0 && (
          <span className="text-xs font-semibold text-yellow-400 bg-yellow-950/40 border border-yellow-900 px-2 py-0.5 rounded-full">
            +{result.xp_earned} XP
          </span>
        )}
      </div>
      <p className="text-zinc-400 text-sm leading-relaxed mb-4">{result.feedback}</p>
      <button
        onClick={onNext}
        className="px-4 py-2 bg-white text-black text-sm font-semibold rounded-lg hover:bg-zinc-200 transition-colors"
      >
        Next Challenge
      </button>
    </div>
  );
}
