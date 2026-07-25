import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateTicketCode } from "@/lib/codes";
import { sendOrderConfirmationEmail } from "@/lib/email";
import { logger } from "@/lib/logger";

/**
 * Orders hold inventory for 30 minutes. Stripe requires Checkout Session
 * expiry to be at least 30 minutes out, so the hold matches that minimum.
 */
export const ORDER_HOLD_MINUTES = 30;

export class SoldOutError extends Error {
  constructor(public ticketTypeName: string) {
    super(`Not enough "${ticketTypeName}" tickets left`);
    this.name = "SoldOutError";
  }
}

export interface AllocationItem {
  ticketTypeId: string;
  quantity: number;
  priceInPence: number;
  name: string;
}

type Tx = Prisma.TransactionClient;

/**
 * Atomically claim inventory for each item. The conditional UPDATE is the
 * overselling guard: it only increments `sold` when the full quantity fits,
 * and an unaffected row means sold out — the transaction rolls back.
 */
export async function claimInventory(
  tx: Tx,
  eventId: string,
  items: AllocationItem[]
): Promise<void> {
  for (const item of items) {
    const updated = await tx.$executeRaw`
      UPDATE "TicketType"
      SET "sold" = "sold" + ${item.quantity}
      WHERE "id" = ${item.ticketTypeId}
        AND "eventId" = ${eventId}
        AND "sold" + ${item.quantity} <= "quantity"
    `;
    if (updated !== 1) throw new SoldOutError(item.name);
  }
}

/** Return claimed inventory (never below zero) for an order's items. */
export async function releaseInventory(
  tx: Tx,
  orderId: string
): Promise<void> {
  const items = await tx.orderItem.findMany({ where: { orderId } });
  for (const item of items) {
    await tx.$executeRaw`
      UPDATE "TicketType"
      SET "sold" = GREATEST("sold" - ${item.quantity}, 0)
      WHERE "id" = ${item.ticketTypeId}
    `;
  }
}

/** Create one ticket per seat with a fresh random code. */
export async function createTicketsForOrder(
  tx: Tx,
  orderId: string
): Promise<void> {
  const items = await tx.orderItem.findMany({ where: { orderId } });
  const data = items.flatMap((item) =>
    Array.from({ length: item.quantity }, () => ({
      orderId,
      ticketTypeId: item.ticketTypeId,
      code: generateTicketCode(),
    }))
  );
  await tx.ticket.createMany({ data });
}

/**
 * Email the confirmation for a paid order. Called after the transaction
 * commits; failures are logged, never thrown — the order is already paid and
 * tickets remain viewable online.
 */
export async function sendConfirmationSafely(orderId: string): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        event: true,
        tickets: { include: { ticketType: { select: { name: true } } } },
      },
    });
    if (!order) return;
    await sendOrderConfirmationEmail({
      id: order.id,
      email: order.email,
      totalInPence: order.totalInPence,
      event: order.event,
      tickets: order.tickets.map((t) => ({
        code: t.code,
        typeName: t.ticketType.name,
        attendeeName: t.attendeeName,
      })),
    });
  } catch (err) {
    logger.error({ err, orderId }, "confirmation email failed");
  }
}
