"use client";

import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/auth/forgot-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        }
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail ?? "Request failed");
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-black text-white px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-2">Forgot Password</h1>

        {submitted ? (
          <>
            <p className="text-zinc-400 text-sm mb-6">
              If that email is registered, a reset link is on its way. Check your inbox.
            </p>
            <Link
              href="/login"
              className="text-zinc-400 text-sm underline underline-offset-2 hover:text-white"
            >
              Back to Sign In
            </Link>
          </>
        ) : (
          <>
            <p className="text-zinc-500 text-sm mb-6">
              Enter your email and we&apos;ll send you a reset link.
            </p>
            {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="px-4 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-white"
                required
              />
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-white text-black font-semibold rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50"
              >
                {loading ? "Sending..." : "Send Reset Link"}
              </button>
            </form>
            <p className="mt-4 text-zinc-500 text-sm">
              <Link href="/login" className="text-white underline underline-offset-2">
                Back to Sign In
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
