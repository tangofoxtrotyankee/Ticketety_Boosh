import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate, formatPence } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const events = await prisma.event.findMany({
    where: { status: "PUBLISHED", endsAt: { gte: new Date() } },
    orderBy: { startsAt: "asc" },
    include: { ticketTypes: { select: { priceInPence: true } } },
  });

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-10 max-w-2xl">
        <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">
          Upcoming <span className="text-primary">events</span>
        </h1>
        <p className="mt-4 text-muted-foreground">
          Internal events for our team and guests. Book your place and
          we&apos;ll email your QR ticket.
        </p>
      </div>

      {events.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nothing scheduled right now — check back soon.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => {
            const fromPrice =
              event.ticketTypes.length > 0
                ? Math.min(...event.ticketTypes.map((t) => t.priceInPence))
                : null;
            return (
              <Link
                key={event.id}
                href={`/events/${event.slug}`}
                className="group"
              >
                <Card className="h-full transition-colors duration-200 group-hover:border-primary">
                  {event.coverImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={event.coverImageUrl}
                      alt=""
                      className="aspect-[16/9] w-full rounded-t-lg border-b object-cover"
                    />
                  ) : (
                    <div
                      aria-hidden
                      className="flex aspect-[16/9] w-full items-center justify-center rounded-t-lg border-b bg-accent text-4xl font-semibold text-primary"
                    >
                      {event.title.slice(0, 1)}
                    </div>
                  )}
                  <CardHeader className="pb-2">
                    <CardTitle className="group-hover:text-primary">
                      {event.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-1 text-sm text-muted-foreground">
                    <p>{formatDate(event.startsAt)}</p>
                    <p>{event.venue}</p>
                    {fromPrice !== null && (
                      <p className="mt-2 font-semibold text-foreground">
                        {fromPrice === 0
                          ? "Free"
                          : `From ${formatPence(fromPrice)}`}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
