"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/**
 * The redirect from Stripe is only a hint — the webhook is the source of
 * truth. Poll the order status until it leaves PENDING, then refresh the
 * server-rendered page to show tickets.
 */
export function OrderStatusPoller({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [attempts, setAttempts] = React.useState(0);

  React.useEffect(() => {
    if (attempts >= 60) return; // ~2 minutes, then leave the manual hint
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}/status`, {
          cache: "no-store",
        });
        if (res.ok) {
          const { status } = (await res.json()) as { status: string };
          if (status !== "PENDING") {
            router.refresh();
            return;
          }
        }
      } catch {
        // transient network error — keep polling
      }
      setAttempts((a) => a + 1);
    }, 2000);
    return () => clearTimeout(timer);
  }, [attempts, orderId, router]);

  return (
    <div className="flex items-center gap-3 text-muted-foreground" role="status">
      <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-primary" />
      <span>
        Confirming your payment…{" "}
        {attempts >= 60 &&
          "This is taking longer than usual — refresh this page in a moment, or check your email."}
      </span>
    </div>
  );
}
