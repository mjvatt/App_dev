import Link from "next/link";
import AuthGuard from "@/components/auth/AuthGuard";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-black flex">
        <aside className="w-56 border-r border-zinc-900 p-6 flex flex-col gap-1 shrink-0">
          <Link href="/dashboard" className="text-lg font-bold text-white mb-6 block">
            PowerUpCode
          </Link>
          <NavLink href="/dashboard">Dashboard</NavLink>
          <NavLink href="/arcade">Arcade</NavLink>
          <NavLink href="/leaderboard">Leaderboard</NavLink>
        </aside>
        <div className="flex-1 overflow-auto">{children}</div>
      </div>
    </AuthGuard>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 py-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors text-sm"
    >
      {children}
    </Link>
  );
}
