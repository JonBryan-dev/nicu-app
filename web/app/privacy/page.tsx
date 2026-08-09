// /privacy — public privacy policy. NOTE: this is a solid working draft, not
// legal advice. Have a UK data-protection professional review it (and add a
// registered contact address) before a public launch — infants' health-context
// data is high-sensitivity.
import Link from "next/link";

export const metadata = { title: "Privacy Policy — Maisie" };

export default function PrivacyPage() {
  return (
    <div className="wrap" style={{ padding: "28px 16px 60px" }}>
      <h1 style={{ fontFamily: "var(--font-fraunces), Georgia, serif" }}>Privacy Policy</h1>
      <p className="muted">Last updated: 9 August 2026</p>

      <p>
        This app is a private space for a family to share updates, photos and care information during a
        hospital (NICU) stay. We take the privacy of that information — especially photos of babies —
        very seriously. This policy explains what we collect, why, and your rights under UK GDPR and the
        Data Protection Act 2018.
      </p>

      <h2>Who we are</h2>
      <p>
        The data controller is Jon Bryan. For any privacy question or request, contact us at{" "}
        <b>jon@plumbgas.services</b>.
        {/* Before a public App Store launch, add a registered contact address here —
            a formal requirement for a controller. Deliberately omitted while the
            app is friends-and-family only. */}
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><b>Account details</b> — your name and email address, used to sign you in.</li>
        <li><b>Content you add</b> — updates, comments, private journal notes, feed/pumping logs, the
          shift rota, visiting slots, and any <b>photos or videos</b> you upload.</li>
        <li><b>Technical data</b> — basic device/browser information needed to run the app and, if you
          turn them on, push-notification tokens.</li>
      </ul>
      <p>
        Photos may show a baby and family members. We treat this content as highly sensitive. We
        automatically <b>remove location (GPS) and other hidden metadata</b> from photos as they are
        uploaded.
      </p>

      <h2>Why we use it (lawful basis)</h2>
      <p>
        We process this data to provide the service you asked for (performing our contract with you) and,
        for sensitive content, on the basis of your <b>explicit consent</b>, which you can withdraw at any
        time by deleting the content or your space.
      </p>

      <h2>Who can see your data</h2>
      <p>
        Only people you invite into your family space can see its content, enforced by database-level
        access controls. Photos are stored privately and shown through short-lived, signed links — they
        are never on the public internet. We do <b>not</b> sell your data or use it for advertising.
      </p>

      <h2>Our processors</h2>
      <p>
        We use trusted providers to run the app: <b>Supabase</b> (database, authentication, file storage)
        and <b>Vercel</b> (hosting). They process data on our instructions under data-processing
        agreements. Your data is stored in the <b>EU (Frankfurt, eu-central-1)</b>.
      </p>

      <h2>How long we keep it</h2>
      <p>
        We keep your data for as long as your space is active. When you delete your space, all content,
        photos and member accounts are permanently erased. You can also delete individual items at any
        time.
      </p>

      <h2>Your rights</h2>
      <p>
        You have the right to access, correct, export, or delete your data, and to object to or restrict
        its processing. You can <b>delete your entire space and all its data</b> from within the app
        (a parent can do this under &ldquo;delete space&rdquo;). To exercise any other right, email us. You
        can also complain to the UK regulator, the <b>ICO</b> (ico.org.uk).
      </p>

      <h2>Security</h2>
      <p>
        Data is encrypted in transit (HTTPS) and at rest. Access is restricted to your own family by
        row-level security, uploads are private, and photo metadata is stripped on upload. No system is
        perfectly secure, but we work to protect your information and will notify you and the ICO of a
        qualifying breach within 72 hours.
      </p>

      <h2>Children&apos;s data</h2>
      <p>
        The app is used by adults (parents and invited family). Content about a baby is provided by, and
        under the control of, that baby&apos;s parents.
      </p>

      <h2>Changes</h2>
      <p>We may update this policy; we&apos;ll note the date above when we do.</p>

      <p style={{ marginTop: 28 }}>
        <Link href="/">← Back to the app</Link>
      </p>
    </div>
  );
}
