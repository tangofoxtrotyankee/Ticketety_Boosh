import type Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { requestLogger } from "@/lib/logger";
import { audit } from "@/lib/audit";
import {
  createTicketsForOrder,
  releaseInventory,
  sendConfirmationSafely,
} from "@/lib/orders";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const log = requestLogger({ route: "stripe-webhook" });
  const signature = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) {
    return Response.json({ error: "Missing signature" }, { status: 400 });
  }

  // Raw body is required for signature verification — never parse first.
  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch (e) {
    log.warn({ e }, "webhook signature verification failed");
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  // The WebhookEvent insert shares the transaction with the state change, so
  // a duplicate delivery hits the unique constraint and changes nothing.
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const orderId = session.metadata?.orderId ?? session.client_reference_id;
        if (!orderId) {
          log.warn({ eventId: event.id }, "completed session without orderId");
          break;
        }
        if (session.payment_status !== "paid") {
          log.info({ orderId }, "session completed but not paid yet; ignoring");
          break;
        }
        const emailFromStripe = session.customer_details?.email;
        let fulfilled = false;
        await prisma.$transaction(async (tx) => {
          await tx.webhookEvent.create({
            data: { id: event.id, type: event.type },
          });
          const order = await tx.order.findUnique({ where: { id: orderId } });
          if (!order) {
            log.warn({ orderId }, "order not found for completed session");
            return;
          }
          if (order.status === "PAID") return;
          if (order.status !== "PENDING" && order.status !== "EXPIRED") {
            log.warn({ orderId, status: order.status }, "unexpected order state");
            return;
          }
          // Rare race: our cron expired the hold but payment still landed
          // (session expiry matches the hold, so this needs clock skew).
          // Honour the payment and re-claim the seats.
          if (order.status === "EXPIRED") {
            const items = await tx.orderItem.findMany({
              where: { orderId },
            });
            for (const item of items) {
              await tx.$executeRaw`
                UPDATE "TicketType"
                SET "sold" = "sold" + ${item.quantity}
                WHERE "id" = ${item.ticketTypeId}
              `;
            }
            log.warn({ orderId }, "re-claimed inventory for expired order that paid");
          }
          await tx.order.update({
            where: { id: orderId },
            data: {
              status: "PAID",
              stripePaymentIntentId:
                typeof session.payment_intent === "string"
                  ? session.payment_intent
                  : session.payment_intent?.id,
              stripeCheckoutId: order.stripeCheckoutId ?? session.id,
              email: order.email || emailFromStripe || order.email,
              expiresAt: null,
            },
          });
          await createTicketsForOrder(tx, orderId);
          fulfilled = true;
        });
        if (fulfilled) {
          await audit({
            action: "order.paid",
            entity: "Order",
            entityId: orderId,
            meta: { stripeEventId: event.id },
          });
          await sendConfirmationSafely(orderId);
          log.info({ orderId }, "order fulfilled");
        }
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object;
        const orderId = session.metadata?.orderId ?? session.client_reference_id;
        if (!orderId) break;
        await prisma.$transaction(async (tx) => {
          await tx.webhookEvent.create({
            data: { id: event.id, type: event.type },
          });
          const order = await tx.order.findUnique({ where: { id: orderId } });
          if (!order || order.status !== "PENDING") return;
          await tx.order.update({
            where: { id: orderId },
            data: { status: "EXPIRED" },
          });
          await releaseInventory(tx, orderId);
        });
        log.info({ orderId }, "order expired via webhook");
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object;
        const paymentIntentId =
          typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : charge.payment_intent?.id;
        if (!paymentIntentId) break;
        let refundedOrderId: string | null = null;
        await prisma.$transaction(async (tx) => {
          await tx.webhookEvent.create({
            data: { id: event.id, type: event.type },
          });
          const order = await tx.order.findUnique({
            where: { stripePaymentIntentId: paymentIntentId },
          });
          if (!order || order.status === "REFUNDED") return;
          await tx.order.update({
            where: { id: order.id },
            data: { status: "REFUNDED" },
          });
          await tx.ticket.updateMany({
            where: { orderId: order.id },
            data: { status: "VOID" },
          });
          await releaseInventory(tx, order.id);
          refundedOrderId = order.id;
        });
        if (refundedOrderId) {
          await audit({
            action: "order.refund.completed",
            entity: "Order",
            entityId: refundedOrderId,
            meta: { stripeEventId: event.id },
          });
          log.info({ orderId: refundedOrderId }, "order refunded; tickets void");
        }
        break;
      }

      default:
        log.info({ type: event.type }, "unhandled webhook event type");
    }
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      // Unique violation on WebhookEvent.id — already processed.
      return Response.json({ received: true, duplicate: true });
    }
    log.error({ e, eventId: event.id }, "webhook processing failed");
    // Non-2xx so Stripe retries.
    return Response.json({ error: "Processing failed" }, { status: 500 });
  }

  return Response.json({ received: true });
}
