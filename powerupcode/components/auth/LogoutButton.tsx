"use client";

import { useRouter } from "next/navigation";
import { Events, resetIdentity, track } from "@/lib/analytics";

export default function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();

  async function handleLogout() {
    track(Events.Logout);
    resetIdentity();
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Best-effort: even if the server call fails the cookies will
      // expire on their own and the client-side state is gone.
    }
    router.push("/login");
  }

  return (
    <button
      onClick={handleLogout}
      className={
        className ??
        "mt-auto px-3 py-2 rounded-lg text-zinc-600 hover:text-white hover:bg-zinc-900 transition-colors text-sm text-left w-full"
      }
    >
      Log out
    </button>
  );
}
