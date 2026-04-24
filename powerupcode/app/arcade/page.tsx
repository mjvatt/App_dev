import { Suspense } from "react";

export default function ArcadePage() {
  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold text-white mb-2">Arcade</h1>
      <p className="text-zinc-400 mb-8">Pick your challenge and start grinding.</p>
      <Suspense fallback={<p className="text-zinc-600 text-sm">Loading challenges...</p>}>
        {/* Challenge grid goes here once engine is wired up */}
      </Suspense>
    </main>
  );
}
