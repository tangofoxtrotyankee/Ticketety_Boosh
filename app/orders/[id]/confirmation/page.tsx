import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDateTime, formatPence } from "@/lib/utils";
import { ticketQrDataUrl } from "@/lib/qr";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { OrderStatusPoller } from "@/components/order-status-poller";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Order confirmation" };

export default async function OrderConfirmationPage({
  params,
}: {
  params: { id: string };
}) {
  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: {
      event: true,
      tickets: {
        where: { status: { not: "VOID" } },
        include: { ticketType: { select: { name: true } } },
      },
    },
  });
  if (!order) notFound();

  const qrCodes =
    order.status === "PAID"
      ? await Promise.all(
          order.tickets.map(async (t) => ({
            ticket: t,
            qr: await ticketQrDataUrl(t.code),
          }))
        )
      : [];

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold">
        {order.status === "PAID" ? "You're booked!" : "Your order"}
      </h1>
      <p className="mt-2 text-muted-foreground">
        {order.event.title} · {formatDateTime(order.event.startsAt)} ·{" "}
        {order.event.venue}
      </p>

      <div className="mt-6 flex flex-col gap-6">
        {order.status === "PENDING" && (
          <>
            <OrderStatusPoller orderId={order.id} />
            <Alert>
              <AlertDescription>
                We&apos;re waiting for payment confirmation. This page will
                update automatically — your tickets will also arrive by email
                at <strong>{order.email}</strong>.
              </AlertDescription>
            </Alert>
          </>
        )}

        {order.status === "EXPIRED" && (
          <Alert variant="warning">
            <AlertTitle>Order expired</AlertTitle>
            <AlertDescription>
              This order wasn&apos;t completed in time and the tickets were
              released.{" "}
              <Link
                href={`/events/${order.event.slug}`}
                className="font-semibold text-primary underline"
              >
                Start again
              </Link>
              . If you believe you were charged, contact the events team.
            </AlertDescription>
          </Alert>
        )}

        {(order.status === "CANCELLED" || order.status === "REFUNDED") && (
          <Alert variant="destructive">
            <AlertTitle>
              {order.status === "REFUNDED" ? "Order refunded" : "Order cancelled"}
            </AlertTitle>
            <AlertDescription>
              {order.status === "REFUNDED"
                ? "This order has been refunded and its tickets are no longer valid."
                : "This order was cancelled and no payment was taken."}
            </AlertDescription>
          </Alert>
        )}

        {order.status === "PAID" && (
          <>
            <Alert variant="success">
              <AlertDescription>
                Payment confirmed — {formatPence(order.totalInPence)}. Your
                tickets are below and have been emailed to{" "}
                <strong>{order.email}</strong>.
              </AlertDescription>
            </Alert>
            <div className="grid gap-6 sm:grid-cols-2">
              {qrCodes.map(({ ticket, qr }) => (
                <Card key={ticket.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">
                      {ticket.ticketType.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={qr}
                      alt={`QR code for ticket ${ticket.code}`}
                      className="h-52 w-52"
                    />
                    <p className="font-mono text-xs">{ticket.code}</p>
                    <Link
                      href={`/tickets/${ticket.code}`}
                      className="text-sm font-semibold text-primary hover:underline"
                    >
                      Open ticket page
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
