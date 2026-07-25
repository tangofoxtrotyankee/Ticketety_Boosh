import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { TicketSelector, type SelectorTicketType } from "@/components/ticket-selector";

export const dynamic = "force-dynamic";

async function getEvent(slug: string) {
  return prisma.event.findFirst({
    where: { slug, status: { in: ["PUBLISHED", "CANCELLED", "COMPLETED"] } },
    include: { ticketTypes: { orderBy: { priceInPence: "asc" } } },
  });
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const event = await getEvent(params.slug);
  return { title: event?.title ?? "Event" };
}

export default async function EventPage({
  params,
}: {
  params: { slug: string };
}) {
  const event = await getEvent(params.slug);
  if (!event) notFound();

  const now = new Date();
  const isPast = event.endsAt < now;
  const canBuy = event.status === "PUBLISHED" && !isPast;

  const ticketTypes: SelectorTicketType[] = event.ticketTypes.map((tt) => {
    const remaining = Math.max(0, tt.quantity - tt.sold);
    let state: SelectorTicketType["state"] = "available";
    if (remaining === 0) state = "sold_out";
    else if (tt.salesStart && tt.salesStart > now) state = "not_started";
    else if (tt.salesEnd && tt.salesEnd < now) state = "ended";
    return {
      id: tt.id,
      name: tt.name,
      priceInPence: tt.priceInPence,
      remaining,
      maxPerOrder: Math.min(tt.maxPerOrder, remaining),
      state,
      salesStart: tt.salesStart?.toISOString() ?? null,
      salesEnd: tt.salesEnd?.toISOString() ?? null,
    };
  });

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <div className="grid gap-10 lg:grid-cols-[1fr_380px]">
        <div>
          {event.coverImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.coverImageUrl}
              alt=""
              className="mb-6 aspect-[16/9] w-full rounded-lg border object-cover"
            />
          )}
          <h1 className="text-3xl font-semibold leading-tight">{event.title}</h1>
          <p className="mt-2 text-muted-foreground">
            {formatDateTime(event.startsAt)} – {formatDateTime(event.endsAt)}
          </p>
          <p className="text-muted-foreground">{event.venue}</p>
          <div className="mt-6 whitespace-pre-line text-base leading-relaxed">
            {event.description}
          </div>
        </div>

        <aside aria-label="Tickets">
          {event.status === "CANCELLED" ? (
            <Alert variant="destructive">
              <AlertTitle>Event cancelled</AlertTitle>
              <AlertDescription>
                This event has been cancelled. If you bought tickets,
                you&apos;ll be contacted about refunds.
              </AlertDescription>
            </Alert>
          ) : isPast || event.status === "COMPLETED" ? (
            <Alert>
              <AlertTitle>This event has ended</AlertTitle>
              <AlertDescription>
                Ticket sales are closed. See the events page for what&apos;s
                next.
              </AlertDescription>
            </Alert>
          ) : ticketTypes.length === 0 ? (
            <Alert>
              <AlertTitle>Tickets not on sale yet</AlertTitle>
              <AlertDescription>Check back soon.</AlertDescription>
            </Alert>
          ) : (
            canBuy && (
              <TicketSelector eventId={event.id} ticketTypes={ticketTypes} />
            )
          )}
        </aside>
      </div>
    </div>
  );
}
