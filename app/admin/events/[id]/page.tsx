import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDateTime, formatPence } from "@/lib/utils";
import {
  publishEvent,
  unpublishEvent,
  cancelEvent,
  completeEvent,
} from "@/app/admin/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { OrdersTable } from "@/components/admin/orders-table";

export const dynamic = "force-dynamic";

export default async function AdminEventDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string; notice?: string };
}) {
  const event = await prisma.event.findUnique({
    where: { id: params.id },
    include: {
      ticketTypes: { orderBy: { priceInPence: "asc" } },
      orders: {
        orderBy: { createdAt: "desc" },
        include: {
          tickets: {
            include: { checkIn: true, ticketType: { select: { name: true } } },
          },
        },
      },
    },
  });
  if (!event) notFound();

  const paidOrders = event.orders.filter((o) => o.status === "PAID");
  const revenue = paidOrders.reduce((n, o) => n + o.totalInPence, 0);
  const sold = event.ticketTypes.reduce((n, t) => n + t.sold, 0);
  const validTickets = event.orders.flatMap((o) =>
    o.tickets.filter((t) => t.status !== "VOID")
  );
  const checkedIn = validTickets.filter((t) => t.checkIn).length;
  const checkedInPct =
    validTickets.length === 0
      ? 0
      : Math.round((checkedIn / validTickets.length) * 100);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{event.title}</h1>
            <Badge
              variant={
                event.status === "PUBLISHED"
                  ? "success"
                  : event.status === "CANCELLED"
                    ? "destructive"
                    : "secondary"
              }
            >
              {event.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {formatDateTime(event.startsAt)} · {event.venue} ·{" "}
            <Link
              href={`/events/${event.slug}`}
              className="text-primary hover:underline"
            >
              public page
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/admin/events/${event.id}/edit`}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            Edit
          </Link>
          <a
            href={`/api/admin/events/${event.id}/export`}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            Export CSV
          </a>
          {event.status === "DRAFT" && (
            <form action={publishEvent.bind(null, event.id)}>
              <Button type="submit" size="sm">
                Publish
              </Button>
            </form>
          )}
          {event.status === "PUBLISHED" && (
            <>
              <form action={unpublishEvent.bind(null, event.id)}>
                <Button type="submit" variant="secondary" size="sm">
                  Unpublish
                </Button>
              </form>
              <form action={completeEvent.bind(null, event.id)}>
                <Button type="submit" variant="secondary" size="sm">
                  Mark completed
                </Button>
              </form>
              <form action={cancelEvent.bind(null, event.id)}>
                <Button type="submit" variant="destructive" size="sm">
                  Cancel event
                </Button>
              </form>
            </>
          )}
        </div>
      </div>

      {searchParams.error && (
        <Alert variant="destructive">
          <AlertDescription>{searchParams.error}</AlertDescription>
        </Alert>
      )}
      {searchParams.notice && (
        <Alert variant="success">
          <AlertDescription>{searchParams.notice}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Tickets sold</CardDescription>
            <CardTitle className="text-3xl">{sold}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Revenue</CardDescription>
            <CardTitle className="text-3xl">{formatPence(revenue)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Checked in</CardDescription>
            <CardTitle className="text-3xl">
              {checkedIn}{" "}
              <span className="text-base font-normal text-muted-foreground">
                ({checkedInPct}%)
              </span>
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <h2 className="text-xl font-semibold">Ticket types</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {event.ticketTypes.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No ticket types yet —{" "}
            <Link
              href={`/admin/events/${event.id}/edit`}
              className="text-primary underline"
            >
              add one
            </Link>{" "}
            before publishing.
          </p>
        )}
        {event.ticketTypes.map((tt) => (
          <Card key={tt.id}>
            <CardHeader className="pb-2">
              <CardDescription>
                {tt.name} · {formatPence(tt.priceInPence)}
              </CardDescription>
              <CardTitle className="text-xl">
                {tt.sold} / {tt.quantity} sold
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <h2 className="text-xl font-semibold">Orders &amp; attendees</h2>
      <OrdersTable orders={event.orders} />
    </div>
  );
}
