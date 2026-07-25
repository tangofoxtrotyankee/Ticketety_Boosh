import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatPence, formatDateTime } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const [upcoming, ticketAgg, revenueAgg, checkedIn] = await Promise.all([
    prisma.event.findMany({
      where: { startsAt: { gte: new Date() }, status: { not: "CANCELLED" } },
      orderBy: { startsAt: "asc" },
      take: 8,
      include: { ticketTypes: { select: { sold: true } } },
    }),
    prisma.ticket.count({ where: { status: { not: "VOID" } } }),
    prisma.order.aggregate({
      where: { status: "PAID" },
      _sum: { totalInPence: true },
    }),
    prisma.checkIn.count(),
  ]);

  const stats = [
    { label: "Tickets sold", value: String(ticketAgg) },
    { label: "Revenue", value: formatPence(revenueAgg._sum.totalInPence ?? 0) },
    { label: "Checked in", value: String(checkedIn) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardDescription>{s.label}</CardDescription>
              <CardTitle className="text-3xl">{s.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Upcoming events</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {upcoming.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No upcoming events yet.{" "}
              <Link href="/admin/events/new" className="text-primary underline">
                Create one
              </Link>
              .
            </p>
          )}
          {upcoming.map((event) => (
            <div
              key={event.id}
              className="flex flex-col gap-1 border-b pb-4 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <Link
                  href={`/admin/events/${event.id}`}
                  className="font-semibold hover:text-primary"
                >
                  {event.title}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {formatDateTime(event.startsAt)} · {event.venue}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {event.ticketTypes.reduce((n, t) => n + t.sold, 0)} sold
                </span>
                <Badge
                  variant={event.status === "PUBLISHED" ? "success" : "secondary"}
                >
                  {event.status}
                </Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
