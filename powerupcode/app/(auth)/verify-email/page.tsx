"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Events, track } from "@/lib/analytics";

type Stage = "checking" | "ready" | "verifying" | "success" | "used" | "expired" | "invalid" | "error";

function VerifyEmailContent() {
  const params = useSearchParams();
  const token = params.get("token");
  const [stage, setStage] = useState<Stage>("checking");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStage("invalid");
      setMessage("No verification token found.");
      return;
    }

    fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/auth/verify-email?token=${encodeURIComponent(token)}`,
      { credentials: "include" }
    )
      .then(async (res) => {
        if (!res.ok) {
          setStage("error");
          setMessage("Could not check this verification link. Try again.");
          return;
        }
        const data: { status: "pending" | "used" | "expired" | "invalid" } = await res.json();
        if (data.status === "pending") setStage("ready");
        else if (data.status === "used") setStage("used");
        else if (data.status === "expired") setStage("expired");
        else setStage("invalid");
      })
      .catch(() => {
        setStage("error");
        setMessage("Could not reach the server. Try again.");
      });
  }, [token]);

  async function handleVerify() {
    if (!token) return;
    setStage("verifying");
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/verify-email`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (res.ok) {
        setStage("success");
        setMessage(data.message ?? "Email verified.");
        track(Events.EmailVerified);
      } else {
        setStage("error");
        setMessage(data.detail ?? "Verification failed.");
      }
    } catch {
      setStage("error");
      setMessage("Something went wrong. Please try again.");
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-black text-white px-6">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-bold mb-4">Email Verification</h1>

        {stage === "checking" && (
          <p className="text-zinc-500 text-sm">Checking your verification link...</p>
        )}

        {stage === "ready" && (
          <>
            <p className="text-zinc-400 text-sm mb-6">Click below to confirm your email address.</p>
            <button
              onClick={handleVerify}
              className="px-4 py-2 bg-white text-black font-semibold rounded-lg hover:bg-zinc-200 transition-colors text-sm"
            >
              Verify Email
            </button>
          </>
        )}

        {stage === "verifying" && (
          <p className="text-zinc-500 text-sm">Verifying...</p>
        )}

        {stage === "success" && (
          <>
            <p className="text-green-400 text-sm mb-6">{message}</p>
            <Link
              href="/login"
              className="px-4 py-2 bg-white text-black font-semibold rounded-lg hover:bg-zinc-200 transition-colors text-sm"
            >
              Sign In
            </Link>
          </>
        )}

        {stage === "used" && (
          <>
            <p className="text-zinc-400 text-sm mb-6">
              This link has already been used. You can sign in now.
            </p>
            <Link
              href="/login"
              className="px-4 py-2 bg-white text-black font-semibold rounded-lg hover:bg-zinc-200 transition-colors text-sm"
            >
              Sign In
            </Link>
          </>
        )}

        {(stage === "expired" || stage === "invalid" || stage === "error") && (
          <>
            <p className="text-red-400 text-sm mb-6">
              {message ||
                (stage === "expired"
                  ? "This verification link has expired. Sign in and request a new one."
                  : "This verification link is not valid.")}
            </p>
            <Link
              href="/login"
              className="text-zinc-400 text-sm underline underline-offset-2 hover:text-white"
            >
              Back to Sign In
            </Link>
          </>
        )}
      </div>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  );
}
