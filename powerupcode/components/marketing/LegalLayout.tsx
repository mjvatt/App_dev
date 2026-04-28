import Link from "next/link";

interface LegalLayoutProps {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}

export default function LegalLayout({ title, lastUpdated, children }: LegalLayoutProps) {
  return (
    <main className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-50 bg-black/80 backdrop-blur border-b border-zinc-900">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="text-base font-bold tracking-tight">
            PowerUpCode
          </Link>
          <nav className="flex items-center gap-3">
            <Link
              href="/login"
              className="px-3 py-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="px-3 py-1.5 text-sm font-semibold text-black bg-white rounded-lg hover:bg-zinc-200 transition-colors"
            >
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <article className="max-w-3xl mx-auto px-6 py-16 sm:py-20">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">{title}</h1>
        <p className="text-sm text-zinc-500 mb-10">Last updated: {lastUpdated}</p>
        <div className="prose-invert text-zinc-300 leading-relaxed [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-white [&_h2]:mt-10 [&_h2]:mb-3 [&_p]:my-3 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:my-1 [&_a]:text-white [&_a]:underline">
          {children}
        </div>
      </article>

      <footer className="border-t border-zinc-900 mt-12">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
          <p className="text-sm text-zinc-500">
            © {new Date().getFullYear()} PowerUpCode. All rights reserved.
          </p>
          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-zinc-500">
            <Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link>
            <Link href="/about" className="hover:text-white transition-colors">About</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <Link href="/contact" className="hover:text-white transition-colors">Contact</Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
