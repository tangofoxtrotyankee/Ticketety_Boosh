import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";
import { randomUUID } from "crypto";

// Smoke tests against a seeded local stack (see playwright.config.ts).
const prisma = new PrismaClient();

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("free ticket purchase end-to-end", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /summer social/i }).first().click();
  await expect(page.getByRole("heading", { name: /summer social/i })).toBeVisible();

  // One free "Team" ticket.
  await page.getByRole("button", { name: /More Team \(free\) tickets/i }).click();
  const email = `e2e-${Date.now()}@example.com`;
  await page.getByLabel(/email for your tickets/i).fill(email);
  await page.getByRole("button", { name: /get free tickets/i }).click();

  await expect(page).toHaveURL(/\/orders\/.+\/confirmation/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: /you're booked/i })).toBeVisible();
  await expect(page.locator("img[alt^='QR code']").first()).toBeVisible();

  const order = await prisma.order.findFirst({
    where: { email },
    include: { tickets: true },
  });
  expect(order?.status).toBe("PAID");
  expect(order?.tickets.length).toBe(1);
});

test("mocked Stripe webhook completes a paid order", async ({ request, page }) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  test.skip(!secret, "STRIPE_WEBHOOK_SECRET not set");

  // Seed a PENDING paid-order directly, as /api/checkout would.
  const ticketType = await prisma.ticketType.findFirstOrThrow({
    where: { priceInPence: { gt: 0 } },
    include: { event: true },
  });
  const email = `e2e-webhook-${Date.now()}@example.com`;
  const order = await prisma.order.create({
    data: {
      eventId: ticketType.eventId,
      email,
      status: "PENDING",
      totalInPence: ticketType.priceInPence,
      idempotencyKey: randomUUID(),
      expiresAt: new Date(Date.now() + 30 * 60_000),
      items: {
        create: [
          {
            ticketTypeId: ticketType.id,
            quantity: 1,
            priceInPence: ticketType.priceInPence,
          },
        ],
      },
    },
  });
  await prisma.ticketType.update({
    where: { id: ticketType.id },
    data: { sold: { increment: 1 } },
  });

  const payload = JSON.stringify({
    id: `evt_test_${randomUUID().replace(/-/g, "")}`,
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: `cs_test_${randomUUID().replace(/-/g, "")}`,
        object: "checkout.session",
        client_reference_id: order.id,
        metadata: { orderId: order.id },
        payment_status: "paid",
        payment_intent: `pi_test_${randomUUID().replace(/-/g, "")}`,
        customer_details: { email },
      },
    },
  });
  const stripe = new Stripe("sk_test_dummy");
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: secret!,
  });

  const res = await request.post("/api/webhooks/stripe", {
    data: payload,
    headers: {
      "content-type": "application/json",
      "stripe-signature": signature,
    },
  });
  expect(res.ok()).toBeTruthy();

  const updated = await prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    include: { tickets: true },
  });
  expect(updated.status).toBe("PAID");
  expect(updated.tickets.length).toBe(1);

  // Confirmation page shows the booked state.
  await page.goto(`/orders/${order.id}/confirmation`);
  await expect(page.getByRole("heading", { name: /you're booked/i })).toBeVisible();

  // Duplicate delivery is acknowledged without reprocessing.
  const dup = await request.post("/api/webhooks/stripe", {
    data: payload,
    headers: {
      "content-type": "application/json",
      "stripe-signature": stripe.webhooks.generateTestHeaderString({
        payload,
        secret: secret!,
      }),
    },
  });
  expect(dup.ok()).toBeTruthy();
  const after = await prisma.ticket.count({ where: { orderId: order.id } });
  expect(after).toBe(1);
});
