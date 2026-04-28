"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { initAnalytics } from "@/lib/analytics";
import posthog from "posthog-js";

export default function AnalyticsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  useEffect(() => {
    initAnalytics();
  }, []);

  // Manual pageview emit on route change so SPA navigations are captured.
  useEffect(() => {
    if (!pathname) return;
    if (typeof window === "undefined") return;
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    posthog.capture("$pageview", { $current_url: window.location.href });
  }, [pathname]);

  return <>{children}</>;
}
