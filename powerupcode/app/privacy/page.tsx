/*
 * STARTER DRAFT — NOT LEGALLY REVIEWED.
 *
 * Generate a real Privacy Policy with Termly or iubenda before launch.
 * GDPR (EU), CCPA (California), and equivalent regulations have specific
 * disclosure requirements that this file approximates but does not
 * guarantee. Replace this body with the generator's output once
 * available, and bump lastUpdated.
 *
 * Do not ship this draft as-is.
 */
import LegalLayout from "@/components/marketing/LegalLayout";

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" lastUpdated="2026-04-28">
      <p>
        This Privacy Policy explains how PowerUpCode (&ldquo;we&rdquo;, &ldquo;us&rdquo;)
        collects, uses, and shares information about you when you use our Service.
      </p>

      <h2>1. Information we collect</h2>
      <ul>
        <li>
          <strong>Account information:</strong> email address, username, and a
          hashed password. We never store passwords in plain text.
        </li>
        <li>
          <strong>Usage data:</strong> challenges you attempt, languages you choose,
          XP earned, streaks, and aggregated progress. This drives the leaderboard
          and adaptive difficulty.
        </li>
        <li>
          <strong>Submissions:</strong> code you submit for evaluation, sent to our
          AI provider for grading and hint generation. Submissions are not used to
          train external models.
        </li>
        <li>
          <strong>Billing data:</strong> payment information is collected and stored
          by Stripe, our payment processor. We receive only the subscription status
          and a Stripe customer reference.
        </li>
        <li>
          <strong>Diagnostic data:</strong> server logs, error reports, and basic
          analytics events (page views, feature usage). Analytics events are
          explicitly defined; we do not autocapture DOM contents.
        </li>
      </ul>

      <h2>2. How we use information</h2>
      <ul>
        <li>To provide, maintain, and improve the Service.</li>
        <li>To evaluate your submissions and generate AI feedback.</li>
        <li>To administer your subscription and prevent fraud.</li>
        <li>To communicate with you about your account and updates to the Service.</li>
        <li>To comply with legal obligations.</li>
      </ul>

      <h2>3. Sharing</h2>
      <p>
        We share information only with the service providers that help us run the
        product:
      </p>
      <ul>
        <li>Anthropic (AI evaluation and hints)</li>
        <li>Stripe (payment processing)</li>
        <li>SendGrid or Mailgun (transactional email)</li>
        <li>PostHog (product analytics)</li>
      </ul>
      <p>
        We do not sell your personal information. We may disclose information when
        required by law or to protect the rights, property, or safety of PowerUpCode,
        our users, or others.
      </p>

      <h2>4. Retention</h2>
      <p>
        We keep account and usage data for as long as your account is active. After
        deletion or prolonged inactivity, we delete or anonymize records on a
        rolling basis, except where retention is required by law (e.g., billing
        records).
      </p>

      <h2>5. Your rights</h2>
      <p>
        Depending on your jurisdiction, you may have the right to access, correct,
        port, or delete your personal information; to object to or restrict
        processing; and to lodge a complaint with a supervisory authority. Contact
        us at <a href="mailto:privacy@powerupcode.com">privacy@powerupcode.com</a>
        {" "}to exercise these rights.
      </p>

      <h2>6. Security</h2>
      <p>
        We hash passwords with bcrypt, encrypt traffic with TLS, store secrets
        outside the codebase, and rate-limit authentication endpoints. No system is
        perfectly secure; report a vulnerability to{" "}
        <a href="mailto:security@powerupcode.com">security@powerupcode.com</a>.
      </p>

      <h2>7. Children</h2>
      <p>
        The Service is not directed to children under 13 (or the equivalent minimum
        age in your jurisdiction). We do not knowingly collect personal information
        from children.
      </p>

      <h2>8. Changes</h2>
      <p>
        We may update this policy. Material changes will be announced by email or
        through the Service at least 14 days before they take effect.
      </p>

      <h2>9. Contact</h2>
      <p>
        Questions or requests? Email{" "}
        <a href="mailto:privacy@powerupcode.com">privacy@powerupcode.com</a>.
      </p>
    </LegalLayout>
  );
}
