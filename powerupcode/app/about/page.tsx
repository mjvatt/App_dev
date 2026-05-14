import LegalLayout from "@/components/marketing/LegalLayout";

export default function AboutPage() {
  return (
    <LegalLayout title="About" lastUpdated="2026-05-13">
      <p>
        PowerUpCode is a data-structures and system-design practice platform
        for engineers who want to keep their reps up year-round &mdash; not
        just in the four weeks before an interview loop.
      </p>

      <h2>The problem with the existing tools</h2>
      <p>
        Most DSA platforms look the same: a sortable problem list, a code
        editor, a verdict. They work, but they treat practice like homework.
        The reward for solving a problem is a checkmark next to it. The
        reward for solving the next one is another checkmark. After a few
        weeks the streak breaks and the tab gets closed for six months.
      </p>

      <h2>What we built instead</h2>
      <p>
        An arcade. Same rigorous problems and explanations underneath, but a
        hub of distinct game modes on top:
      </p>
      <ul>
        <li>
          <strong>Quick Play</strong> &mdash; adaptive single problem with a
          live timer and a personal-best chase.
        </li>
        <li>
          <strong>Daily Challenge</strong> &mdash; one problem for everyone
          on a UTC date, ranked by time.
        </li>
        <li>
          <strong>Review</strong> &mdash; spaced-repetition queue of cards
          that are coming due.
        </li>
        <li>
          <strong>Boss Rush</strong> &mdash; three boss-tier problems
          back-to-back, three lives total, flawless run bonus.
        </li>
        <li>
          <strong>Mock Interview</strong> &mdash; multi-stage session with a
          verbal explanation track and an AI-graded post-mortem on a
          0&ndash;100 scale.
        </li>
      </ul>
      <p>
        Difficulty maps to four worlds &mdash; Forest, Cavern, Volcano, and
        the Boss Lair. You earn XP and power-up tokens, and you can spend
        tokens on revives, mid-run extra lives, time freezes during a Mock
        Interview, or streak shields that protect a daily streak when life
        gets in the way. None of it changes the underlying problem set; it
        changes whether you come back tomorrow.
      </p>

      <h2>How we make money</h2>
      <p>
        Subscriptions, one tier. Easy-world challenges are free forever.
        Medium, Hard, and Boss require a paid plan: $5 weekly, $12 monthly,
        or $120 yearly. We don&apos;t sell user data, we don&apos;t use
        submissions to train external AI models, and we don&apos;t run ads.
      </p>

      <h2>What we won&apos;t do</h2>
      <ul>
        <li>Sell or rent your personal information.</li>
        <li>Use your code submissions to train third-party models.</li>
        <li>Add tracking that captures keystrokes or DOM contents.</li>
        <li>Auto-renew you into a tier you didn&apos;t pick. Cancellation
          takes effect at the end of your current billing period and
          you can cancel from the billing page in two clicks.</li>
      </ul>

      <h2>Get in touch</h2>
      <p>
        Feedback, partnership inquiries, and bug reports go to{" "}
        <a href="mailto:hello@powerupcode.com">hello@powerupcode.com</a>.
        Security disclosures go to{" "}
        <a href="mailto:security@powerupcode.com">security@powerupcode.com</a>.
        Every email is read by a human.
      </p>
    </LegalLayout>
  );
}
