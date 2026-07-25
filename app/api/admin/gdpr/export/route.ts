import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const querySchema = z.object({ email: z.string().trim().toLowerCase().email() });

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({ email: url.searchParams.get("email") });
  if (!parsed.success) {
    return Response.json({ error: "Invalid email" }, { status: 400 });
  }
  const { email } = parsed.data;

  const [user, orders] = await Promise.all([
    prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    }),
    prisma.order.findMany({
      where: { email },
      include: {
        event: { select: { title: true, startsAt: true } },
        tickets: {
          include: {
            ticketType: { select: { name: true } },
            checkIn: { select: { at: true } },
          },
        },
      },
    }),
  ]);

  await audit({
    actorId: session.user.id,
    action: "gdpr.export",
    entity: "User",
    entityId: email,
  });

  return new Response(JSON.stringify({ email, user, orders }, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="gdpr-export.json"`,
    },
  });
}
