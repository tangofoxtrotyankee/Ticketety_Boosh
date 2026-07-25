import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { releaseInventory } from "@/lib/orders";
import { requestLogger } from "@/lib/logger";

export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const log = requestLogger({ route: "cron-expire-orders" });

  // Small grace period after the hold so a payment finishing right at the
  // boundary wins the race against expiry.
  const cutoff = new Date(Date.now() - 5 * 60_000);
  const stale = await prisma.order.findMany({
    where: { status: "PENDING", expiresAt: { lt: cutoff } },
    select: { id: true },
    take: 200,
  });

  let expired = 0;
  for (const { id } of stale) {
    await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id } });
      if (order?.status !== "PENDING") return;
      await tx.order.update({ where: { id }, data: { status: "EXPIRED" } });
      await releaseInventory(tx, id);
      expired += 1;
    });
  }
  if (expired > 0) log.info({ expired }, "expired stale pending orders");
  return Response.json({ expired });
}
