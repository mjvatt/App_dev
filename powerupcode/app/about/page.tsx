/* Boilerplate copy. Rewrite with the actual product story before launch. */
import LegalLayout from "@/components/marketing/LegalLayout";

export default function AboutPage() {
  return (
    <LegalLayout title="About" lastUpdated="2026-04-28">
      <p>
        PowerUpCode is built for engineers who want to stay sharp without burning out
        on the same drill-style problem lists. We believe interview prep should reward
        showing up — not just grinding.
      </p>
      <h2>What we&apos;re trying to do</h2>
      <p>
        Most data structures and system design platforms today look the same: a
        sortable list, a code editor, a verdict. They work, but they don&apos;t make
        practice a habit. We&apos;re building an arcade loop on top of that core: XP,
        levels, daily streaks, boss challenges, and AI feedback that explains why a
        solution failed instead of just marking it wrong.
      </p>
      <h2>How we make money</h2>
      <p>
        Subscriptions. Easy-tier challenges are free forever; medium, hard, and boss
        tiers require a paid plan. We don&apos;t sell user data, we don&apos;t train
        external AI models on submissions, and we don&apos;t run ads.
      </p>
      <h2>Get in touch</h2>
      <p>
        Feedback, partnership inquiries, and bug reports go to{" "}
        <a href="mailto:hello@powerupcode.com">hello@powerupcode.com</a>. We read
        everything.
      </p>
    </LegalLayout>
  );
}
