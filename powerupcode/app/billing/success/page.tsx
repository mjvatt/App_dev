import Link from "next/link";

export default function BillingSuccessPage() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-8">
      <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-10 max-w-md w-full text-center">
        <div className="w-12 h-12 rounded-full bg-green-400/10 flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-6 h-6 text-green-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-white mb-2">You&apos;re subscribed</h1>
        <p className="text-zinc-500 text-sm mb-8">Your plan is now active. Head to the arcade.</p>
        <Link
          href="/arcade"
          className="inline-block px-6 py-2.5 bg-white text-black text-sm font-semibold rounded-lg hover:bg-zinc-200 transition-colors"
        >
          Go to Arcade
        </Link>
      </div>
    </div>
  );
}
