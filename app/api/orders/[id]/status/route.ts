import { prisma } from "@/lib/prisma";
import { globalApiLimiter, clientIp, rateLimitResponse } from "@/lib/rate-limit";
import { z } from "zod";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({ id: z.string().min(1).max(64) });

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const limit = await globalApiLimiter.limit(clientIp(req));
  if (!limit.success) return rateLimitResponse(limit);

  const parsed = paramsSchema.safeParse(params);
  if (!parsed.success) {
    return Response.json({ error: "Invalid order id" }, { status: 400 });
  }
  const order = await prisma.order.findUnique({
    where: { id: parsed.data.id },
    select: { status: true },
  });
  if (!order) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ status: order.status });
}
