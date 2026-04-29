"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authedRequest } from "@/lib/api";

type AuthState = "checking" | "authed" | "anon";

/**
 * Verifies the user has a valid session by calling /api/auth/me.
 * If the access cookie is expired, authedRequest auto-refreshes once
 * before returning. A failed /me redirects to /login.
 */
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<AuthState>("checking");

  useEffect(() => {
    let cancelled = false;
    authedRequest("/api/auth/me")
      .then(() => {
        if (!cancelled) setState("authed");
      })
      .catch(() => {
        if (cancelled) return;
        setState("anon");
        router.replace("/login");
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (state !== "authed") return null;
  return <>{children}</>;
}
