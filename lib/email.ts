import { Resend } from "resend";
import { logger } from "@/lib/logger";
import { formatDateTime, formatPence, appUrl } from "@/lib/utils";
import { ticketQrPng } from "@/lib/qr";
import { buildIcs } from "@/lib/ics";

function getResend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not configured");
  return new Resend(key);
}

const FROM = () => process.env.EMAIL_FROM ?? "TFY Tickets <tickets@example.com>";

// Shared inline styles keep emails consistent with the app's flat, purple-
// accented look (email clients need inline CSS).
const wrap = (inner: string) => `
<div style="background:#ffffff;padding:40px 16px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#000000;">
  <div style="max-width:560px;margin:0 auto;">
    <div style="border-bottom:2px solid #a370fc;padding-bottom:16px;margin-bottom:24px;">
      <span style="font-size:20px;font-weight:600;">TFY <span style="color:#a370fc;">Tickets</span></span>
    </div>
    ${inner}
    <p style="margin-top:40px;font-size:12px;color:#1a1a1a;">
      You received this email because it was requested for this address at TFY Tickets.
    </p>
  </div>
</div>`;

const buttonHtml = (href: string, label: string) =>
  `<a href="${href}" style="display:inline-block;background:#a370fc;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:12px 24px;border-radius:4px;">${label}</a>`;

export async function sendMagicLinkEmail(email: string, url: string) {
  await getResend().emails.send({
    from: FROM(),
    to: email,
    subject: "Sign in to TFY Tickets",
    html: wrap(`
      <h1 style="font-size:22px;font-weight:600;line-height:1.3;margin:0 0 16px;">Sign in to TFY Tickets</h1>
      <p style="font-size:16px;line-height:1.5;margin:0 0 24px;">Click the button below to sign in. This link is valid for 15 minutes and can be used once.</p>
      ${buttonHtml(url, "Sign in")}
      <p style="font-size:14px;color:#1a1a1a;margin-top:24px;">If you didn't request this, you can safely ignore this email.</p>
    `),
    text: `Sign in to TFY Tickets: ${url}\n\nThis link is valid for 15 minutes. If you didn't request it, ignore this email.`,
  });
  logger.info({ email }, "magic link email sent");
}

interface ConfirmationTicket {
  code: string;
  typeName: string;
  attendeeName: string | null;
}

export async function sendOrderConfirmationEmail(order: {
  id: string;
  email: string;
  totalInPence: number;
  event: {
    id: string;
    slug: string;
    title: string;
    description: string;
    venue: string;
    startsAt: Date;
    endsAt: Date;
  };
  tickets: ConfirmationTicket[];
}) {
  const { event } = order;
  const attachments = await Promise.all(
    order.tickets.map(async (t, i) => ({
      filename: `ticket-${i + 1}-${t.code.slice(0, 6)}.png`,
      content: (await ticketQrPng(t.code)).toString("base64"),
      contentId: `qr-${t.code}`,
    }))
  );
  attachments.push({
    filename: "event.ics",
    content: Buffer.from(
      buildIcs({ ...event, url: appUrl(`/events/${event.slug}`) })
    ).toString("base64"),
    contentId: "event-ics",
  });

  const ticketBlocks = order.tickets
    .map(
      (t) => `
      <div style="border:1px solid rgba(0,0,0,0.15);border-radius:4px;padding:16px;margin-bottom:16px;">
        <p style="font-size:16px;font-weight:600;margin:0 0 8px;">${t.typeName}${t.attendeeName ? ` — ${t.attendeeName}` : ""}</p>
        <p style="font-size:14px;color:#1a1a1a;margin:0 0 8px;">Code: <code style="font-size:13px;">${t.code}</code></p>
        <img src="cid:qr-${t.code}" alt="QR code for ticket ${t.code}" width="240" height="240" style="display:block;max-width:240px;height:auto;" />
        <p style="font-size:14px;margin:8px 0 0;"><a href="${appUrl(`/tickets/${t.code}`)}" style="color:#a370fc;">View ticket online</a></p>
      </div>`
    )
    .join("");

  await getResend().emails.send({
    from: FROM(),
    to: order.email,
    subject: `Your tickets for ${event.title}`,
    html: wrap(`
      <h1 style="font-size:22px;font-weight:600;line-height:1.3;margin:0 0 16px;">You're going to ${event.title}!</h1>
      <p style="font-size:16px;line-height:1.5;margin:0 0 8px;"><strong>When:</strong> ${formatDateTime(event.startsAt)}</p>
      <p style="font-size:16px;line-height:1.5;margin:0 0 8px;"><strong>Where:</strong> ${event.venue}</p>
      <p style="font-size:16px;line-height:1.5;margin:0 0 24px;"><strong>Order total:</strong> ${formatPence(order.totalInPence)} · Order <code>${order.id}</code></p>
      <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">Show a QR code below at the door — each ticket can be scanned once. A calendar invite is attached.</p>
      ${ticketBlocks}
      ${buttonHtml(appUrl(`/orders/${order.id}/confirmation`), "View order")}
    `),
    text: [
      `You're going to ${event.title}!`,
      `When: ${formatDateTime(event.startsAt)}`,
      `Where: ${event.venue}`,
      `Order: ${order.id} (${formatPence(order.totalInPence)})`,
      "",
      ...order.tickets.map(
        (t) => `${t.typeName}: ${appUrl(`/tickets/${t.code}`)}`
      ),
    ].join("\n"),
    attachments,
  });
  logger.info({ orderId: order.id }, "order confirmation email sent");
}
