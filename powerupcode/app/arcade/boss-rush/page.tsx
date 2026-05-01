"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import AuthGuard from "@/components/auth/AuthGuard";
import { authedRequest } from "@/lib/api";
import type { BossRushSession } from "@/lib/types";

export default function BossRushStartPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // Strict mode + dev hot-reload would otherwise post twice; this guard
  // keeps the start call to one round-trip per mount.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    authedRequest<BossRushSession>("/api/boss-rush/start", { method: "POST" })
      .then((session) => router.replace(`/arcade/boss-rush/${session.id}`))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to start run.")
      );
  }, [router]);

  return (
    <AuthGuard>
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-8 max-w-md w-full text-center">
          {error ? (
            <>
              <p className="text-red-400 text-sm mb-4">{error}</p>
              <button
                onClick={() => router.push("/arcade")}
                className="text-xs text-white border border-zinc-700 rounded-lg px-3 py-1.5 hover:bg-zinc-800"
              >
                Back to arcade
              </button>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-red-400 mb-2">
                Boss Lair
              </p>
              <p className="text-lg text-white mb-1">Drawing your three bosses…</p>
              <p className="text-sm text-zinc-400">3 lives. All-or-nothing.</p>
            </>
          )}
        </div>
      </div>
    </AuthGuard>
  );
}
