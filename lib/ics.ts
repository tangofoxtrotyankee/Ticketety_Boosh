/** Minimal RFC 5545 calendar attachment for an event. */
export function buildIcs(event: {
  id: string;
  title: string;
  description: string;
  venue: string;
  startsAt: Date;
  endsAt: Date;
  url: string;
}): string {
  const stamp = (d: Date) =>
    d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const escape = (s: string) =>
    s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TFY Tickets//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.id}@tfy-tickets`,
    `DTSTAMP:${stamp(new Date(event.startsAt))}`,
    `DTSTART:${stamp(event.startsAt)}`,
    `DTEND:${stamp(event.endsAt)}`,
    `SUMMARY:${escape(event.title)}`,
    `DESCRIPTION:${escape(event.description)}`,
    `LOCATION:${escape(event.venue)}`,
    `URL:${event.url}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
