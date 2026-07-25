import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { requestLogger } from "@/lib/logger";
import { appUrl } from "@/lib/utils";
import { checkoutSchema, firstZodMessage } from "@/lib/validation";
import {
  ORDER_HOLD_MINUTES,
  SoldOutError,
  claimInventory,
  createTicketsForOrder,
  releaseInventory,
  sendConfirmationSafely,
  type AllocationItem,
} from "@/lib/orders";
import {
  checkoutEmailLimiter,
  checkoutIpLimiter,
  globalApiLimiter,
  clientIp,
  rateLimitResponse,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const err = (message: string, status = 400) =>
  Response.json({ error: message }, { status });

export async function POST(req: Request) {
  const log = requestLogger({ route: "checkout" });
  const ip = clientIp(req);

  const globalLimit = await globalApiLimiter.limit(ip);
  if (!globalLimit.success) return rateLimitResponse(globalLimit);
  const ipLimit = await checkoutIpLimiter.limit(ip);
  if (!ipLimit.success) return rateLimitResponse(ipLimit);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err("Invalid request body.");
  }
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) return err(firstZodMessage(parsed.error));
  const { eventId, email, idempotencyKey, items } = parsed.data;

  const emailLimit = await checkoutEmailLimiter.limit(email);
  if (!emailLimit.success) return rateLimitResponse(emailLimit);

  // Same idempotency key seen before → return the existing outcome instead of
  // creating a second order (double-click / retry safety).
  const existing = await prisma.order.findUnique({
    where: { idempotencyKey },
  });
  if (existing) {
    if (existing.status === "PAID") return Response.json({ orderId: existing.id });
    if (existing.status === "PENDING" && existing.stripeCheckoutId) {
      try {
        const session = await getStripe().checkout.sessions.retrieve(
          existing.stripeCheckoutId
        );
        if (session.url) return Response.json({ url: session.url });
      } catch (e) {
        log.warn({ e, orderId: existing.id }, "could not re-fetch session");
      }
    }
    return err("This checkout was already started — check your email or retry from the event page.", 409);
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { ticketTypes: true },
  });
  if (!event || event.status !== "PUBLISHED") {
    return err("This event is not on sale.", 404);
  }
  const now = new Date();
  if (event.endsAt < now) return err("This event has ended.");

  // Resolve every requested item against DB state: prices, windows, limits.
  const allocations: AllocationItem[] = [];
  for (const item of items) {
    const tt = event.ticketTypes.find((t) => t.id === item.ticketTypeId);
    if (!tt) return err("Unknown ticket type.");
    if (tt.salesStart && tt.salesStart > now)
      return err(`"${tt.name}" tickets are not on sale yet.`);
    if (tt.salesEnd && tt.salesEnd < now)
      return err(`"${tt.name}" ticket sales have ended.`);
    if (item.quantity > tt.maxPerOrder)
      return err(`Maximum ${tt.maxPerOrder} "${tt.name}" tickets per order.`);
    allocations.push({
      ticketTypeId: tt.id,
      quantity: item.quantity,
      priceInPence: tt.priceInPence,
      name: tt.name,
    });
  }

  const totalInPence = allocations.reduce(
    (sum, a) => sum + a.priceInPence * a.quantity,
    0
  );
  const isFree = totalInPence === 0;
  const session = await auth();
  const expiresAt = new Date(now.getTime() + ORDER_HOLD_MINUTES * 60_000);

  let orderId: string;
  try {
    orderId = await prisma.$transaction(async (tx) => {
      await claimInventory(tx, event.id, allocations);
      const order = await tx.order.create({
        data: {
          eventId: event.id,
          userId: session?.user?.id ?? null,
          email,
          status: isFree ? "PAID" : "PENDING",
          totalInPence,
          idempotencyKey,
          expiresAt: isFree ? null : expiresAt,
          items: {
            create: allocations.map((a) => ({
              ticketTypeId: a.ticketTypeId,
              quantity: a.quantity,
              priceInPence: a.priceInPence,
            })),
          },
        },
      });
      if (isFree) await createTicketsForOrder(tx, order.id);
      return order.id;
    });
  } catch (e) {
    if (e instanceof SoldOutError) {
      return err(
        `Sorry — ${e.message.toLowerCase()}. Someone may have beaten you to it.`,
        409
      );
    }
    log.error({ e }, "order creation failed");
    return err("Could not start checkout. Please try again.", 500);
  }

  if (isFree) {
    log.info({ orderId }, "free order completed");
    await sendConfirmationSafely(orderId);
    return Response.json({ orderId });
  }

  try {
    const stripeSession = await getStripe().checkout.sessions.create(
      {
        mode: "payment",
        customer_email: email,
        client_reference_id: orderId,
        metadata: { orderId },
        line_items: allocations.map((a) => ({
          quantity: a.quantity,
          price_data: {
            currency: "gbp",
            unit_amount: a.priceInPence,
            product_data: {
              name: `${event.title} — ${a.name}`,
            },
          },
        })),
        expires_at: Math.floor(expiresAt.getTime() / 1000),
        success_url: appUrl(`/orders/${orderId}/confirmation`),
        cancel_url: appUrl(`/events/${event.slug}`),
      },
      { idempotencyKey }
    );
    await prisma.order.update({
      where: { id: orderId },
      data: { stripeCheckoutId: stripeSession.id },
    });
    log.info({ orderId }, "checkout session created");
    return Response.json({ url: stripeSession.url });
  } catch (e) {
    log.error({ e, orderId }, "stripe session creation failed");
    // Roll the hold back so the seats go back on sale immediately.
    await prisma.$transaction(async (tx) => {
      const fresh = await tx.order.findUnique({ where: { id: orderId } });
      if (fresh?.status === "PENDING") {
        await tx.order.update({
          where: { id: orderId },
          data: { status: "CANCELLED" },
        });
        await releaseInventory(tx, orderId);
      }
    });
    return err("Payment provider is unavailable right now. Please try again.", 502);
  }
}
