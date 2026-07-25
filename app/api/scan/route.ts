import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { safeEqual } from "@/lib/codes";
import { scanSchema } from "@/lib/validation";
import { requestLogger } from "@/lib/logger";
import { audit } from "@/lib/audit";
import { scanLimiter, rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type ScanResult =
  | {
      result: "OK";
      ticket: { typeName: string; attendeeName: string | null; eventTitle: string };
      checkedInCount: number;
    }
  | { result: "ALREADY_CHECKED_IN"; at: string; ticket: { typeName: string; eventTitle: string } }
  | { result: "VOID" }
  | { result: "INVALID" };

export async function POST(req: Request) {
  // Role is enforced here, not just in middleware.
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user?.id || (role !== "STAFF" && role !== "ADMIN")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const limit = await scanLimiter.limit(session.user.id);
  if (!limit.success) return rateLimitResponse(limit);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }
  const parsed = scanSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ result: "INVALID" } satisfies ScanResult);
  }
  const code = parsed.data.code;
  const log = requestLogger({ route: "scan", staffId: session.user.id });

  const ticket = await prisma.ticket.findUnique({
    where: { code },
    include: {
      ticketType: { select: { name: true } },
      order: { include: { event: { select: { id: true, title: true } } } },
      checkIn: true,
    },
  });

  // Constant-time comparison of the presented code against the stored one —
  // the unique lookup already matched, this guards against any comparison
  // side-channel on the hot path.
  if (!ticket || !safeEqual(ticket.code, code) || ticket.order.status !== "PAID") {
    return Response.json({ result: "INVALID" } satisfies ScanResult);
  }
  if (ticket.status === "VOID") {
    return Response.json({ result: "VOID" } satisfies ScanResult);
  }
  if (ticket.checkIn) {
    return Response.json({
      result: "ALREADY_CHECKED_IN",
      at: ticket.checkIn.at.toISOString(),
      ticket: {
        typeName: ticket.ticketType.name,
        eventTitle: ticket.order.event.title,
      },
    } satisfies ScanResult);
  }

  try {
    // The unique constraint on CheckIn.ticketId is the atomic double-scan
    // guard: two simultaneous scans race on the insert and one loses.
    await prisma.$transaction([
      prisma.checkIn.create({
        data: { ticketId: ticket.id, byUserId: session.user.id },
      }),
      prisma.ticket.update({
        where: { id: ticket.id },
        data: { status: "CHECKED_IN" },
      }),
    ]);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const existing = await prisma.checkIn.findUnique({
        where: { ticketId: ticket.id },
      });
      return Response.json({
        result: "ALREADY_CHECKED_IN",
        at: existing?.at.toISOString() ?? new Date().toISOString(),
        ticket: {
          typeName: ticket.ticketType.name,
          eventTitle: ticket.order.event.title,
        },
      } satisfies ScanResult);
    }
    log.error({ e }, "check-in failed");
    return Response.json({ error: "Check-in failed" }, { status: 500 });
  }

  const checkedInCount = await prisma.checkIn.count({
    where: { ticket: { order: { eventId: ticket.order.event.id } } },
  });
  log.info({ ticketId: ticket.id }, "ticket checked in");
  await audit({
    actorId: session.user.id,
    action: "ticket.checkIn",
    entity: "Ticket",
    entityId: ticket.id,
    meta: { eventId: ticket.order.event.id },
  });

  return Response.json({
    result: "OK",
    ticket: {
      typeName: ticket.ticketType.name,
      attendeeName: ticket.attendeeName,
      eventTitle: ticket.order.event.title,
    },
    checkedInCount,
  } satisfies ScanResult);
}
