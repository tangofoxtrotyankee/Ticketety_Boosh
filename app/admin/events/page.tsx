import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDateTime, formatPence } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

const statusVariant = {
  DRAFT: "secondary",
  PUBLISHED: "success",
  CANCELLED: "destructive",
  COMPLETED: "outline",
} as const;

export default async function AdminEventsPage() {
  const events = await prisma.event.findMany({
    orderBy: { startsAt: "desc" },
    include: {
      ticketTypes: { select: { sold: true, priceInPence: true } },
      orders: {
        where: { status: "PAID" },
        select: { totalInPence: true },
      },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Events</h1>
        <Link href="/admin/events/new" className={buttonVariants({ size: "sm" })}>
          New event
        </Link>
      </div>
      {events.length === 0 ? (
        <p className="text-muted-foreground">
          No events yet — create your first one.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event</TableHead>
              <TableHead>Starts</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Sold</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((event) => (
              <TableRow key={event.id}>
                <TableCell>
                  <Link
                    href={`/admin/events/${event.id}`}
                    className="font-semibold hover:text-primary"
                  >
                    {event.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">/{event.slug}</p>
                </TableCell>
                <TableCell>{formatDateTime(event.startsAt)}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant[event.status]}>
                    {event.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {event.ticketTypes.reduce((n, t) => n + t.sold, 0)}
                </TableCell>
                <TableCell className="text-right">
                  {formatPence(
                    event.orders.reduce((n, o) => n + o.totalInPence, 0)
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
