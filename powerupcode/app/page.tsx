import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-black text-white px-6">
      <h1 className="text-5xl font-bold mb-4 tracking-tight">PowerUpCode</h1>
      <p className="text-lg text-zinc-400 mb-10 max-w-md text-center leading-relaxed">
        Level up your DSA and System Design skills through gamified challenges.
      </p>
      <div className="flex gap-4">
        <Link
          href="/register"
          className="px-6 py-3 bg-white text-black font-semibold rounded-lg hover:bg-zinc-200 transition-colors"
        >
          Get Started
        </Link>
        <Link
          href="/login"
          className="px-6 py-3 border border-zinc-700 text-white font-semibold rounded-lg hover:border-white transition-colors"
        >
          Sign In
        </Link>
      </div>
    </main>
  );
}
