import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

function csvField(value: string | number | null | undefined): string {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const event = await prisma.event.findUnique({
    where: { id: params.id },
    include: {
      orders: {
        orderBy: { createdAt: "asc" },
        include: {
          tickets: {
            include: {
              ticketType: { select: { name: true } },
              checkIn: true,
            },
          },
        },
      },
    },
  });
  if (!event) return Response.json({ error: "Not found" }, { status: 404 });

  const header = [
    "order_id",
    "order_status",
    "email",
    "ticket_code",
    "ticket_type",
    "ticket_status",
    "attendee_name",
    "checked_in_at",
    "order_total_pence",
    "ordered_at",
  ].join(",");

  const rows = event.orders.flatMap((order) =>
    order.tickets.length === 0
      ? [
          [
            order.id,
            order.status,
            order.email,
            "",
            "",
            "",
            "",
            "",
            order.totalInPence,
            order.createdAt.toISOString(),
          ]
            .map(csvField)
            .join(","),
        ]
      : order.tickets.map((t) =>
          [
            order.id,
            order.status,
            order.email,
            t.code,
            t.ticketType.name,
            t.status,
            t.attendeeName ?? "",
            t.checkIn?.at.toISOString() ?? "",
            order.totalInPence,
            order.createdAt.toISOString(),
          ]
            .map(csvField)
            .join(",")
        )
  );

  await audit({
    actorId: session.user.id,
    action: "event.export",
    entity: "Event",
    entityId: event.id,
  });

  return new Response([header, ...rows].join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${event.slug}-attendees.csv"`,
    },
  });
}
