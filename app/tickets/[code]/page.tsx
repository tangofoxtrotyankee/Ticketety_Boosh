import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { TICKET_CODE_REGEX } from "@/lib/codes";
import { ticketQrDataUrl } from "@/lib/qr";
import { formatDateTime } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your ticket" };

export default async function TicketPage({
  params,
}: {
  params: { code: string };
}) {
  const code = params.code.toUpperCase();
  if (!TICKET_CODE_REGEX.test(code)) notFound();

  const ticket = await prisma.ticket.findUnique({
    where: { code },
    include: {
      ticketType: { select: { name: true } },
      order: { include: { event: true } },
      checkIn: true,
    },
  });
  if (!ticket || ticket.order.status !== "PAID") notFound();

  const { event } = ticket.order;
  const qr = await ticketQrDataUrl(ticket.code);

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 sm:px-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>{event.title}</CardTitle>
            {ticket.status === "VOID" ? (
              <Badge variant="destructive">VOID</Badge>
            ) : ticket.checkIn ? (
              <Badge variant="secondary">CHECKED IN</Badge>
            ) : (
              <Badge variant="success">VALID</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {formatDateTime(event.startsAt)} · {event.venue}
          </p>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          {ticket.status === "VOID" ? (
            <Alert variant="destructive">
              <AlertDescription>
                This ticket is no longer valid (order refunded or ticket
                voided).
              </AlertDescription>
            </Alert>
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qr}
                alt={`QR code for ticket ${ticket.code}`}
                className="h-64 w-64"
              />
              <p className="font-mono text-sm">{ticket.code}</p>
              <p className="text-sm font-semibold">{ticket.ticketType.name}</p>
              {ticket.attendeeName && (
                <p className="text-sm text-muted-foreground">
                  {ticket.attendeeName}
                </p>
              )}
              {ticket.checkIn && (
                <Alert>
                  <AlertDescription>
                    Checked in at {formatDateTime(ticket.checkIn.at)}.
                  </AlertDescription>
                </Alert>
              )}
              <p className="text-center text-xs text-muted-foreground">
                Show this QR code at the door. Each ticket admits one person
                and can only be scanned once.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
