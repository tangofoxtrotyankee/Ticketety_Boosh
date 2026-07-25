"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { formatPence, formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export interface SelectorTicketType {
  id: string;
  name: string;
  priceInPence: number;
  remaining: number;
  maxPerOrder: number;
  state: "available" | "sold_out" | "not_started" | "ended";
  salesStart: string | null;
  salesEnd: string | null;
}

export function TicketSelector({
  eventId,
  ticketTypes,
}: {
  eventId: string;
  ticketTypes: SelectorTicketType[];
}) {
  const router = useRouter();
  const [quantities, setQuantities] = React.useState<Record<string, number>>({});
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  // Stable per page load: retrying a failed submit reuses the same key, so the
  // server can dedupe checkout creation.
  const idempotencyKey = React.useMemo(() => crypto.randomUUID(), []);

  const setQty = (id: string, max: number, next: number) => {
    setQuantities((q) => ({ ...q, [id]: Math.max(0, Math.min(max, next)) }));
  };

  const items = ticketTypes
    .filter((tt) => (quantities[tt.id] ?? 0) > 0)
    .map((tt) => ({ ticketTypeId: tt.id, quantity: quantities[tt.id]! }));
  const total = items.reduce((sum, item) => {
    const tt = ticketTypes.find((t) => t.id === item.ticketTypeId)!;
    return sum + tt.priceInPence * item.quantity;
  }, 0);

  async function checkout(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, email, idempotencyKey, items }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        orderId?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(
          res.status === 429
            ? "Too many attempts — please wait a minute and try again."
            : (data.error ?? "Something went wrong. Please try again.")
        );
        return;
      }
      if (data.url) {
        window.location.assign(data.url);
      } else if (data.orderId) {
        router.push(`/orders/${data.orderId}/confirmation`);
      } else {
        setError("Unexpected response — please try again.");
      }
    } catch {
      setError("Network problem — please check your connection and retry.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tickets</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={checkout} className="flex flex-col gap-4">
          {ticketTypes.map((tt) => {
            const qty = quantities[tt.id] ?? 0;
            return (
              <div
                key={tt.id}
                className="flex items-center justify-between gap-4 border-b pb-4 last:border-0"
              >
                <div>
                  <p className="font-semibold">{tt.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatPence(tt.priceInPence)}
                    {tt.state === "available" && tt.remaining <= 10 && (
                      <span className="ml-2 text-warning">
                        Only {tt.remaining} left
                      </span>
                    )}
                  </p>
                  {tt.state === "sold_out" && (
                    <p className="text-sm font-semibold text-destructive">
                      Sold out
                    </p>
                  )}
                  {tt.state === "not_started" && tt.salesStart && (
                    <p className="text-sm text-muted-foreground">
                      On sale from {formatDateTime(new Date(tt.salesStart))}
                    </p>
                  )}
                  {tt.state === "ended" && (
                    <p className="text-sm text-muted-foreground">
                      Sales have ended
                    </p>
                  )}
                </div>
                {tt.state === "available" && (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      aria-label={`Fewer ${tt.name} tickets`}
                      onClick={() => setQty(tt.id, tt.maxPerOrder, qty - 1)}
                      disabled={qty === 0}
                    >
                      −
                    </Button>
                    <span
                      className="w-6 text-center font-semibold"
                      aria-live="polite"
                    >
                      {qty}
                    </span>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      aria-label={`More ${tt.name} tickets`}
                      onClick={() => setQty(tt.id, tt.maxPerOrder, qty + 1)}
                      disabled={qty >= tt.maxPerOrder}
                    >
                      +
                    </Button>
                  </div>
                )}
              </div>
            );
          })}

          <div className="flex flex-col gap-2">
            <Label htmlFor="checkout-email">Email for your tickets</Label>
            <Input
              id="checkout-email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-xl font-semibold">{formatPence(total)}</span>
          </div>
          <Button
            type="submit"
            disabled={items.length === 0 || submitting}
            aria-busy={submitting}
          >
            {submitting
              ? "Preparing checkout…"
              : total === 0
                ? "Get free tickets"
                : "Continue to payment"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Paid orders are held for 15 minutes while you complete payment.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
