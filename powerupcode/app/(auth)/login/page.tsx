"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getRememberedEmail, rememberEmail, setToken } from "@/lib/auth";
import PasswordInput from "@/components/ui/PasswordInput";
import type { TokenResponse } from "@/lib/types";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const remembered = getRememberedEmail();
    if (remembered) {
      setEmail(remembered);
      // Skip the email field and put cursor in password — the most likely flow
      // for a returning user.
      passwordRef.current?.focus();
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail ?? "Login failed");
      }
      const data: TokenResponse = await res.json();
      setToken(data.access_token);
      rememberEmail(email);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-black text-white px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-6">Sign In</h1>
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
          <PasswordInput
            ref={passwordRef}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="px-4 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-white"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-white text-black font-semibold rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
        <p className="mt-4 text-zinc-500 text-sm">
          <Link href="/forgot-password" className="text-zinc-400 underline underline-offset-2 hover:text-white">
            Forgot password?
          </Link>
        </p>
        <p className="mt-2 text-zinc-500 text-sm">
          No account?{" "}
          <Link href="/register" className="text-white underline underline-offset-2">
            Register
          </Link>
        </p>
      </div>
    </main>
  );
}
