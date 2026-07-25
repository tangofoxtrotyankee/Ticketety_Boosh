import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy notice" };

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold">Privacy notice</h1>
      <div className="mt-6 flex flex-col gap-4 text-base leading-relaxed">
        <p>
          TFY Tickets is our internal event ticketing service. We collect the
          minimum personal data needed to run our events:
        </p>
        <ul className="list-disc pl-6">
          <li>
            <strong>Email address</strong> — to send your tickets, sign-in
            links and order updates.
          </li>
          <li>
            <strong>Name</strong> (optional) — if provided, shown on your
            ticket for door check-in.
          </li>
        </ul>
        <p>
          Payments are processed by Stripe on their hosted checkout page; card
          details never touch our servers. Emails are delivered via Resend.
          Ticket scans record which ticket was checked in, when, and by which
          member of staff.
        </p>
        <p>
          We keep order records for accounting purposes. You can ask us to
          export or delete your personal data at any time — contact the events
          team and we&apos;ll action it under the UK GDPR.
        </p>
        <p>
          We don&apos;t use advertising trackers, and we don&apos;t share your
          data with anyone beyond the processors named above.
        </p>
      </div>
    </div>
  );
}
