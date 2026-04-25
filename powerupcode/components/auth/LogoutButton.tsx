"use client";

import { useRouter } from "next/navigation";
import { clearToken } from "@/lib/auth";

export default function LogoutButton() {
  const router = useRouter();

  function handleLogout() {
    clearToken();
    router.push("/login");
  }

  return (
    <button
      onClick={handleLogout}
      className="mt-auto px-3 py-2 rounded-lg text-zinc-600 hover:text-white hover:bg-zinc-900 transition-colors text-sm text-left w-full"
    >
      Log out
    </button>
  );
}
