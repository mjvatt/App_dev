import Link from "next/link";

const PLANS = [
  {
    label: "Weekly",
    price: "$2",
    period: "per week",
    note: "Try it out",
    highlight: false,
  },
  {
    label: "Monthly",
    price: "$5",
    period: "per month",
    note: "Most popular",
    highlight: true,
  },
  {
    label: "Annual",
    price: "$40",
    period: "per year",
    note: "About $3.33 / month",
    highlight: false,
  },
];

const FEATURES = [
  "All easy challenges, free forever",
  "Medium, hard, and boss tiers on any paid plan",
  "AI-driven feedback on every attempt",
  "Adaptive difficulty based on your last five attempts",
  "Streak tracking, XP, and leaderboard",
  "Cancel anytime",
];

export default function PricingPage() {
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

      <section className="max-w-6xl mx-auto px-6 py-16 sm:py-20">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">Pricing</h1>
          <p className="text-lg text-zinc-400">
            Easy challenges are always free. Subscribe to unlock medium, hard, and boss
            tiers with full AI feedback.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
          {PLANS.map((plan) => (
            <div
              key={plan.label}
              className={`relative bg-zinc-950 border rounded-xl p-6 flex flex-col gap-4 ${
                plan.highlight ? "border-white" : "border-zinc-900"
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white text-black text-xs font-semibold px-3 py-0.5 rounded-full">
                  Popular
                </span>
              )}
              <div>
                <p className="text-sm font-semibold text-zinc-400">{plan.label}</p>
                <p className="text-3xl font-bold text-white mt-1">
                  {plan.price}
                  <span className="text-base font-normal text-zinc-500"> {plan.period}</span>
                </p>
                <p className="text-xs text-zinc-600 mt-1">{plan.note}</p>
              </div>
              <Link
                href="/register"
                className={`w-full py-2 rounded-lg text-sm font-semibold text-center transition-colors ${
                  plan.highlight
                    ? "bg-white text-black hover:bg-zinc-200"
                    : "border border-zinc-700 text-white hover:border-white"
                }`}
              >
                Start free
              </Link>
            </div>
          ))}
        </div>

        <div className="mt-16 max-w-2xl mx-auto">
          <h2 className="text-xl font-semibold text-center mb-6">Every plan includes</h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {FEATURES.map((f) => (
              <li
                key={f}
                className="bg-zinc-950 border border-zinc-900 rounded-lg px-4 py-3 text-sm text-zinc-300"
              >
                {f}
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-12 text-center text-xs text-zinc-600">
          Prices in USD. Taxes may apply depending on your location.
        </p>
      </section>

      <footer className="border-t border-zinc-900 mt-8">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
          <p className="text-sm text-zinc-500">
            © {new Date().getFullYear()} PowerUpCode. All rights reserved.
          </p>
          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-zinc-500">
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
