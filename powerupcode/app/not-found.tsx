import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-black text-white px-6">
      <div className="text-center">
        <p className="text-6xl font-bold text-zinc-800 mb-4">404</p>
        <h1 className="text-xl font-semibold text-white mb-2">Page not found</h1>
        <p className="text-zinc-500 text-sm mb-8">
          This page does not exist or was moved.
        </p>
        <Link
          href="/dashboard"
          className="px-4 py-2 bg-white text-black font-semibold rounded-lg hover:bg-zinc-200 transition-colors text-sm"
        >
          Go to Dashboard
        </Link>
      </div>
    </main>
  );
}
