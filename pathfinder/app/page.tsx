"use client";

import { useState } from "react";
import { recommend, type RecommendResponse } from "@/lib/api";

export default function Home() {
  const [moc, setMoc] = useState("");
  const [background, setBackground] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecommendResponse | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await recommend({ moc, background: background || undefined });
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">Pathfinder</h1>
        <p className="mt-2 text-zinc-400">
          MOS to civilian roles, with skill-gap analysis and citations.
        </p>
      </header>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="moc" className="block text-sm font-medium text-zinc-300">
            MOC
          </label>
          <input
            id="moc"
            value={moc}
            onChange={(event) => setMoc(event.target.value.toUpperCase())}
            placeholder="e.g., 11B, 25B, 68W"
            required
            className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="background" className="block text-sm font-medium text-zinc-300">
            Background (optional)
          </label>
          <textarea
            id="background"
            value={background}
            onChange={(event) => setBackground(event.target.value)}
            rows={4}
            placeholder="Rank, time in service, interests, geographic constraints, etc."
            className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !moc}
          className="rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 disabled:opacity-50"
        >
          {loading ? "Analyzing..." : "Find roles"}
        </button>
      </form>

      {error && (
        <p className="mt-6 rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {result && (
        <section className="mt-10 space-y-6">
          {result.notes && (
            <p className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-500">
              {result.notes}
            </p>
          )}
          {result.recommendations.map((rec) => (
            <article
              key={rec.soc_code}
              className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-5"
            >
              <header className="flex items-baseline justify-between gap-4">
                <h2 className="text-lg font-medium">{rec.title}</h2>
                <span className="text-xs text-zinc-500">
                  SOC {rec.soc_code} · fit {(rec.fit_score * 100).toFixed(0)}%
                </span>
              </header>
              <p className="mt-2 text-sm text-zinc-300">{rec.rationale}</p>

              {rec.skill_gaps.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Skill gaps
                  </h3>
                  <ul className="mt-2 space-y-1 text-sm">
                    {rec.skill_gaps.map((gap, idx) => (
                      <li key={idx} className="flex gap-3 text-zinc-300">
                        <span
                          className={`inline-block w-12 shrink-0 text-xs font-medium uppercase tracking-wide ${
                            gap.have ? "text-emerald-400" : "text-yellow-400"
                          }`}
                        >
                          {gap.have ? "have" : "gap"}
                        </span>
                        <span>
                          {gap.skill}
                          {gap.note && <span className="text-zinc-500"> — {gap.note}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {rec.citations.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Sources
                  </h3>
                  <ul className="mt-2 space-y-1 text-sm">
                    {rec.citations.map((cite, idx) => (
                      <li key={idx}>
                        {cite.url ? (
                          <a
                            href={cite.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-zinc-300 underline-offset-2 hover:underline"
                          >
                            {cite.title}
                          </a>
                        ) : (
                          <span className="text-zinc-300">{cite.title}</span>
                        )}
                        <span className="text-zinc-600"> · {cite.source}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          ))}
        </section>
      )}

      <footer className="mt-16 border-t border-zinc-900 pt-6 text-xs text-zinc-600">
        Pathfinder is informational. It does not replace VA benefits counseling,
        licensed career advisors, or official career transition programs.
      </footer>
    </main>
  );
}
