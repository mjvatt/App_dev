"use client";

import { useRouter } from "next/navigation";
import { Events, resetIdentity, track } from "@/lib/analytics";
import { clearToken } from "@/lib/auth";

export default function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();

  function handleLogout() {
    track(Events.Logout);
    resetIdentity();
    clearToken();
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
