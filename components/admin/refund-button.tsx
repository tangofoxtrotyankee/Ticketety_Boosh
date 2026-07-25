"use client";

import * as React from "react";
import { refundOrder } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";

export function RefundButton({
  eventId,
  orderId,
}: {
  eventId: string;
  orderId: string;
}) {
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      type="button"
      variant="destructive"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (
          window.confirm(
            "Refund this order? Its tickets will be voided and the seats released."
          )
        ) {
          startTransition(() => refundOrder(eventId, orderId));
        }
      }}
    >
      {pending ? "Refunding…" : "Refund"}
    </Button>
  );
}
