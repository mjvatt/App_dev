"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import PasswordInput from "@/components/ui/PasswordInput";

function ResetPasswordContent() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/auth/reset-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, new_password: password }),
        }
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail ?? "Reset failed");
      }
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-black text-white px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-6">Reset Password</h1>

        {!token && (
          <p className="text-red-400 text-sm">
            Invalid reset link.{" "}
            <Link href="/forgot-password" className="underline underline-offset-2">
              Request a new one
            </Link>
          </p>
        )}

        {token && success && (
          <>
            <p className="text-green-400 text-sm mb-6">Password updated successfully.</p>
            <Link
              href="/login"
              className="px-4 py-2 bg-white text-black font-semibold rounded-lg hover:bg-zinc-200 transition-colors text-sm"
            >
              Sign In
            </Link>
          </>
        )}

        {token && !success && (
          <>
            {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <PasswordInput
                placeholder="New password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="px-4 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-white"
                required
                minLength={8}
              />
              <PasswordInput
                placeholder="Confirm new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="px-4 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-white"
                required
                minLength={8}
              />
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-white text-black font-semibold rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50"
              >
                {loading ? "Updating..." : "Update Password"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordContent />
    </Suspense>
  );
}
