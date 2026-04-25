"use client";

import { useEffect, useState } from "react";
import { authedRequest } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { SubscriptionStatus } from "@/lib/types";

const PLANS = [
  {
    id: "weekly" as const,
    label: "Weekly",
    price: "$2",
    period: "/ week",
    note: "Try it out",
    highlight: false,
  },
  {
    id: "monthly" as const,
    label: "Monthly",
    price: "$5",
    period: "/ month",
    note: "Most popular",
    highlight: true,
  },
  {
    id: "annual" as const,
    label: "Annual",
    price: "$40",
    period: "/ year",
    note: "~$3.33 / month",
    highlight: false,
  },
];

type PlanId = (typeof PLANS)[number]["id"];

export default function BillingPage() {
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    authedRequest<SubscriptionStatus>("/api/billing/status", token)
      .then(setStatus)
      .catch(() => setStatus({ active: false, tier: null, status: null, current_period_end: null }))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubscribe(plan: PlanId) {
    const token = getToken();
    if (!token) return;
    setCheckingOut(plan);
    setError(null);
    try {
      const origin = window.location.origin;
      const data = await authedRequest<{ url: string }>("/api/billing/checkout", token, {
        method: "POST",
        body: JSON.stringify({
          plan,
          success_url: `${origin}/billing/success`,
          cancel_url: `${origin}/billing`,
        }),
      });
      window.location.href = data.url;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Checkout failed. Try again.");
      setCheckingOut(null);
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-white mb-8">Billing</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-zinc-950 border border-zinc-900 rounded-xl p-6 animate-pulse">
              <div className="h-4 w-20 bg-zinc-800 rounded mb-4" />
              <div className="h-8 w-16 bg-zinc-800 rounded mb-6" />
              <div className="h-9 w-full bg-zinc-800 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-2">Billing</h1>

      {status?.active ? (
        <div className="mb-8 inline-flex items-center gap-2 px-4 py-3 bg-zinc-950 border border-zinc-900 rounded-xl">
          <span className="h-2 w-2 rounded-full bg-green-400 shrink-0" />
          <span className="text-sm text-zinc-300">
            Active plan:{" "}
            <span className="text-white font-semibold capitalize">{status.tier}</span>
          </span>
        </div>
      ) : (
        <p className="text-zinc-500 text-sm mb-8">Choose a plan to unlock all challenges.</p>
      )}

      {error && <p className="text-red-400 text-sm mb-6">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PLANS.map((plan) => {
          const isCurrent = status?.tier === plan.id && status.active;
          return (
            <div
              key={plan.id}
              className={`relative bg-zinc-950 border rounded-xl p-6 flex flex-col gap-4 ${
                plan.highlight ? "border-white" : "border-zinc-900"
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white text-black text-xs font-semibold px-3 py-0.5 rounded-full">
                  Popular
                </span>
              )}
              <div>
                <p className="text-sm font-semibold text-zinc-400">{plan.label}</p>
                <p className="text-3xl font-bold text-white mt-1">
                  {plan.price}
                  <span className="text-base font-normal text-zinc-500"> {plan.period}</span>
                </p>
                <p className="text-xs text-zinc-600 mt-1">{plan.note}</p>
              </div>
              <button
                onClick={() => handleSubscribe(plan.id)}
                disabled={!!checkingOut || isCurrent}
                className={`w-full py-2 rounded-lg text-sm font-semibold transition-colors disabled:cursor-not-allowed ${
                  isCurrent
                    ? "bg-zinc-900 text-zinc-500"
                    : plan.highlight
                    ? "bg-white text-black hover:bg-zinc-200 disabled:opacity-40"
                    : "border border-zinc-700 text-white hover:border-white disabled:opacity-40"
                }`}
              >
                {isCurrent
                  ? "Current plan"
                  : checkingOut === plan.id
                  ? "Redirecting..."
                  : "Subscribe"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
