import Link from "next/link";
import AuthGuard from "@/components/auth/AuthGuard";
import LogoutButton from "@/components/auth/LogoutButton";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-black flex flex-col md:flex-row">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex w-56 border-r border-zinc-900 p-6 flex-col gap-1 shrink-0">
          <Link href="/dashboard" className="text-lg font-bold text-white mb-6 block">
            PowerUpCode
          </Link>
          <NavLink href="/dashboard">Dashboard</NavLink>
          <NavLink href="/arcade">Arcade</NavLink>
          <NavLink href="/history">History</NavLink>
          <NavLink href="/leaderboard">Leaderboard</NavLink>
          <NavLink href="/billing">Billing</NavLink>
          <LogoutButton />
        </aside>
        {/* Mobile top nav */}
        <header className="md:hidden sticky top-0 z-10 bg-black border-b border-zinc-900">
          <div className="flex items-center gap-1 px-2 py-2 overflow-x-auto">
            <Link href="/dashboard" className="text-sm font-bold text-white px-3 py-2 shrink-0 mr-2">
              PowerUpCode
            </Link>
            <NavLink href="/dashboard">Dashboard</NavLink>
            <NavLink href="/arcade">Arcade</NavLink>
            <NavLink href="/history">History</NavLink>
            <NavLink href="/leaderboard">Leaderboard</NavLink>
            <NavLink href="/billing">Billing</NavLink>
            <LogoutButton className="shrink-0 px-3 py-2 rounded-lg text-zinc-600 hover:text-white hover:bg-zinc-900 transition-colors text-sm" />
          </div>
        </header>
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
