import LegalLayout from "@/components/marketing/LegalLayout";

export default function ContactPage() {
  return (
    <LegalLayout title="Contact" lastUpdated="2026-04-28">
      <p>
        We&apos;d love to hear from you. Pick the channel that fits.
      </p>
      <h2>General &amp; product feedback</h2>
      <p>
        Email us at{" "}
        <a href="mailto:hello@powerupcode.com">hello@powerupcode.com</a>. Describe what
        you&apos;re seeing, what you expected, and a screenshot if it&apos;s a bug.
        Most replies within one business day.
      </p>
      <h2>Billing &amp; account questions</h2>
      <p>
        Email{" "}
        <a href="mailto:billing@powerupcode.com">billing@powerupcode.com</a> and
        include the email address on your account so we can find your subscription
        quickly.
      </p>
      <h2>Privacy &amp; data requests</h2>
      <p>
        Send GDPR / CCPA / data-portability requests to{" "}
        <a href="mailto:privacy@powerupcode.com">privacy@powerupcode.com</a>. We
        respond within the timeframe required by applicable law.
      </p>
      <h2>Security</h2>
      <p>
        Found a vulnerability? Report it privately to{" "}
        <a href="mailto:security@powerupcode.com">security@powerupcode.com</a>.
        We do not currently run a paid bug bounty but we&apos;ll credit responsible
        disclosure on this page when published.
      </p>
    </LegalLayout>
  );
}
