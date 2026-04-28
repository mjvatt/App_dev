/*
 * STARTER DRAFT — NOT LEGALLY REVIEWED.
 *
 * This file is a structural placeholder so the routes resolve and the
 * footer doesn't 404. Before launch:
 *   1. Generate a real Terms of Service via Termly, iubenda, or your
 *      attorney. Both Termly and iubenda have free tiers that cover a
 *      typical SaaS subscription product.
 *   2. Replace the body content below with the generator's output.
 *   3. Bump lastUpdated to the date of the new version.
 *
 * Do not ship this draft as-is. It does not constitute legal advice and
 * has not been reviewed by counsel.
 */
import LegalLayout from "@/components/marketing/LegalLayout";

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" lastUpdated="2026-04-28">
      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of
        PowerUpCode (the &ldquo;Service&rdquo;). By creating an account or using the
        Service, you agree to be bound by these Terms.
      </p>

      <h2>1. Account</h2>
      <p>
        You must provide accurate registration information and are responsible for
        keeping your password secure. You may not share your account or use someone
        else&apos;s. We may suspend or terminate accounts that violate these Terms.
      </p>

      <h2>2. Subscriptions and billing</h2>
      <p>
        Some features require a paid subscription. Subscriptions renew automatically
        at the end of each billing period until canceled. You can cancel any time
        from the billing page; cancellation takes effect at the end of the current
        period. Refunds are issued at our discretion in accordance with applicable
        consumer-protection law.
      </p>

      <h2>3. Acceptable use</h2>
      <ul>
        <li>Don&apos;t reverse-engineer, scrape, or attempt to extract proprietary
          challenge content or AI-generated feedback in bulk.</li>
        <li>Don&apos;t share answers, solutions, or AI-generated hints publicly in
          ways that would allow others to bypass the learning loop.</li>
        <li>Don&apos;t use the Service to attack, defraud, or harm others.</li>
        <li>Don&apos;t upload content you don&apos;t have the right to share.</li>
      </ul>

      <h2>4. Your content</h2>
      <p>
        You retain ownership of code you submit. You grant us a limited license to
        process your submissions in order to provide evaluation, hints, and progress
        tracking. We do not sell submissions and do not use them to train external
        AI models.
      </p>

      <h2>5. Intellectual property</h2>
      <p>
        The Service, including challenge text, branding, software, and AI prompts,
        is owned by PowerUpCode and licensed to you for personal, non-commercial use.
      </p>

      <h2>6. Disclaimers</h2>
      <p>
        The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;
        without warranties of any kind, whether express or implied. We do not
        guarantee that the Service will be uninterrupted or error-free.
      </p>

      <h2>7. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, PowerUpCode and its affiliates will
        not be liable for indirect, incidental, special, consequential, or punitive
        damages, including lost profits, arising out of or related to your use of
        the Service.
      </p>

      <h2>8. Changes</h2>
      <p>
        We may update these Terms from time to time. Material changes will be
        announced by email or through the Service at least 14 days before they take
        effect. Continued use after the effective date constitutes acceptance.
      </p>

      <h2>9. Contact</h2>
      <p>
        Questions about these Terms? Email{" "}
        <a href="mailto:legal@powerupcode.com">legal@powerupcode.com</a>.
      </p>
    </LegalLayout>
  );
}
