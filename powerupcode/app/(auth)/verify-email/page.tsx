"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function VerifyEmailContent() {
  const params = useSearchParams();
  const token = params.get("token");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("No verification token found.");
      return;
    }

    fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/auth/verify-email?token=${encodeURIComponent(token)}`
    )
      .then(async (res) => {
        const data = await res.json();
        if (res.ok) {
          setStatus("success");
          setMessage(data.message ?? "Email verified.");
        } else {
          setStatus("error");
          setMessage(data.detail ?? "Verification failed.");
        }
      })
      .catch(() => {
        setStatus("error");
        setMessage("Something went wrong. Please try again.");
      });
  }, [token]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-black text-white px-6">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-bold mb-4">Email Verification</h1>

        {status === "loading" && (
          <p className="text-zinc-500 text-sm">Verifying your email...</p>
        )}

        {status === "success" && (
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

        {status === "error" && (
          <>
            <p className="text-red-400 text-sm mb-6">{message}</p>
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
