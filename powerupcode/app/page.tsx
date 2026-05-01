import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white">
      <SiteNav />
      <Hero />
      <WhyUs />
      <HowItWorks />
      <PricingTeaser />
      <FAQ />
      <ClosingCTA />
      <Footer />
    </main>
  );
}

function SiteNav() {
  return (
    <header className="sticky top-0 z-50 bg-black/80 backdrop-blur border-b border-zinc-900">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="text-base font-bold tracking-tight">
          PowerUpCode
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <a
            href="#pricing"
            className="hidden sm:block px-3 py-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Pricing
          </a>
          <a
            href="#faq"
            className="hidden sm:block px-3 py-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
          >
            FAQ
          </a>
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
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="max-w-4xl mx-auto px-6 pt-24 pb-20 sm:pt-32 sm:pb-28 text-center">
        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight leading-[1.05]">
          Practice DSA like a game
          <br className="hidden sm:block" />
          <span className="text-zinc-400"> you actually want to play.</span>
        </h1>
        <p className="mt-6 text-lg sm:text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed">
          PowerUpCode turns coding interviews into an arcade. Level up, build streaks, and
          beat boss challenges with AI-driven hints — instead of grinding through another
          problem list.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/register"
            className="px-6 py-3 bg-white text-black font-semibold rounded-lg hover:bg-zinc-200 transition-colors"
          >
            Start free
          </Link>
          <a
            href="#pricing"
            className="px-6 py-3 border border-zinc-700 text-white font-semibold rounded-lg hover:border-white transition-colors"
          >
            See pricing
          </a>
        </div>
        <p className="mt-6 text-xs text-zinc-600">
          Free easy challenges. No credit card required.
        </p>
      </div>
    </section>
  );
}

function WhyUs() {
  const items = [
    {
      title: "An arcade loop, not a problem list",
      body: "XP, levels, streaks, and boss challenges turn daily practice into a habit. The interview prep apps you've used are 95% identical lists; this one rewards showing up.",
    },
    {
      title: "AI feedback that explains why",
      body: "When a solution fails, you get specific guidance pointing at the line, the edge case, or the algorithmic issue. Not just 'wrong answer.'",
    },
    {
      title: "Adaptive difficulty that meets you",
      body: "Solve a few easy problems and the engine starts mixing in mediums. Crush five hards in a row and a boss challenge unlocks. The ramp matches the player.",
    },
  ];
  return (
    <section className="border-t border-zinc-900">
      <div className="max-w-6xl mx-auto px-6 py-20 sm:py-24">
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-center mb-3">
          Why PowerUpCode
        </h2>
        <p className="text-zinc-500 text-center max-w-xl mx-auto mb-12">
          Built for engineers who want to stay sharp without burning out on the same drills.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {items.map((item) => (
            <div
              key={item.title}
              className="bg-zinc-950 border border-zinc-900 rounded-xl p-6"
            >
              <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: 1,
      title: "Pick a challenge",
      body: "Browse by topic or let auto-difficulty find your next problem based on your last five attempts.",
    },
    {
      n: 2,
      title: "Code in a real editor",
      body: "Monaco editor with Python, JavaScript, TypeScript, and Java. Drafts auto-save per challenge.",
    },
    {
      n: 3,
      title: "Earn XP, climb the board",
      body: "Pass a challenge to gain XP, extend your streak, and unlock harder tiers. Boss fights wait at the top.",
    },
  ];
  return (
    <section className="border-t border-zinc-900 bg-zinc-950/30">
      <div className="max-w-6xl mx-auto px-6 py-20 sm:py-24">
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-center mb-12">
          How it works
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {steps.map((step) => (
            <div key={step.n} className="bg-zinc-950 border border-zinc-900 rounded-xl p-6">
              <div className="text-xs font-semibold text-zinc-500 mb-3">STEP {step.n}</div>
              <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingTeaser() {
  const plans = [
    {
      label: "Weekly",
      price: "$5",
      period: "per week",
      note: "Try it out",
      highlight: false,
    },
    {
      label: "Monthly",
      price: "$12",
      period: "per month",
      note: "Most popular",
      highlight: true,
    },
    {
      label: "Annual",
      price: "$120",
      period: "per year",
      note: "$10 / month",
      highlight: false,
    },
  ];
  return (
    <section id="pricing" className="border-t border-zinc-900 scroll-mt-16">
      <div className="max-w-6xl mx-auto px-6 py-20 sm:py-24">
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-center mb-3">
          Pricing
        </h2>
        <p className="text-zinc-500 text-center max-w-xl mx-auto mb-12">
          Easy challenges are always free. Subscribe to unlock medium, hard, and boss
          tiers with full AI feedback.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
          {plans.map((plan) => (
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
        <p className="mt-8 text-center text-xs text-zinc-600">
          Cancel anytime. No questions asked.
        </p>
      </div>
    </section>
  );
}

function FAQ() {
  const items = [
    {
      q: "How is this different from LeetCode or NeetCode?",
      a: "Those tools are excellent at being problem lists. PowerUpCode is built for daily engagement: XP, levels, streaks, and boss fights give you a reason to come back. AI-driven feedback explains why a solution failed instead of just marking it wrong.",
    },
    {
      q: "Which languages are supported?",
      a: "Python, JavaScript, TypeScript, and Java. More on the way.",
    },
    {
      q: "Can I try it without paying?",
      a: "Yes. Register for free and you get access to all easy-tier challenges immediately. Medium, hard, and boss challenges require an active subscription.",
    },
    {
      q: "Can I cancel any time?",
      a: "Yes. Cancel from the billing page; you keep paid access through the end of your current period and then drop back to easy tier.",
    },
    {
      q: "Is there a mobile app?",
      a: "An iOS and Android app built with React Native is in beta. The web app works well on phones in the meantime.",
    },
    {
      q: "Is my code private?",
      a: "Yes. We never share or sell submissions. AI feedback is generated per-attempt and not used to train external models.",
    },
  ];
  return (
    <section id="faq" className="border-t border-zinc-900 scroll-mt-16">
      <div className="max-w-3xl mx-auto px-6 py-20 sm:py-24">
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-center mb-12">
          Frequently asked
        </h2>
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <details
              key={item.q}
              className="group bg-zinc-950 border border-zinc-900 rounded-xl px-5 py-4 open:border-zinc-800"
            >
              <summary className="cursor-pointer list-none flex items-center justify-between text-sm font-semibold text-white">
                {item.q}
                <span className="text-zinc-600 group-open:rotate-45 transition-transform text-lg leading-none">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm text-zinc-400 leading-relaxed">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function ClosingCTA() {
  return (
    <section className="border-t border-zinc-900">
      <div className="max-w-3xl mx-auto px-6 py-20 sm:py-24 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
          Get sharper, one challenge at a time.
        </h2>
        <p className="mt-4 text-zinc-400">
          Free to start. Easy tier unlocks the moment you sign up.
        </p>
        <Link
          href="/register"
          className="inline-block mt-8 px-6 py-3 bg-white text-black font-semibold rounded-lg hover:bg-zinc-200 transition-colors"
        >
          Start free
        </Link>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-zinc-900">
      <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
        <p className="text-sm text-zinc-500">
          © {new Date().getFullYear()} PowerUpCode. All rights reserved.
        </p>
        <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-zinc-500">
          <a href="#pricing" className="hover:text-white transition-colors">
            Pricing
          </a>
          <a href="#faq" className="hover:text-white transition-colors">
            FAQ
          </a>
          <Link href="/login" className="hover:text-white transition-colors">
            Sign in
          </Link>
          <Link href="/terms" className="hover:text-white transition-colors">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-white transition-colors">
            Privacy
          </Link>
          <Link href="/contact" className="hover:text-white transition-colors">
            Contact
          </Link>
        </nav>
      </div>
    </footer>
  );
}
