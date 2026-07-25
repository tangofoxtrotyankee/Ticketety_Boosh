import type { Order, Ticket, CheckIn } from "@prisma/client";
import { formatDateTime, formatPence } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
type OrderWithTickets = Order & {
  tickets: Array<
    Ticket & { checkIn: CheckIn | null; ticketType: { name: string } }
  >;
};

const statusVariant = {
  PENDING: "warning",
  PAID: "success",
  CANCELLED: "secondary",
  REFUNDED: "outline",
  EXPIRED: "secondary",
} as const;

export function OrdersTable({ orders }: { orders: OrderWithTickets[] }) {
  if (orders.length === 0) {
    return <p className="text-sm text-muted-foreground">No orders yet.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Order</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Tickets</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((order) => (
          <TableRow key={order.id}>
            <TableCell>
              <span className="font-mono text-xs">{order.id}</span>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(order.createdAt)}
              </p>
            </TableCell>
            <TableCell>{order.email}</TableCell>
            <TableCell>
              {order.tickets.length === 0 ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <ul className="flex flex-col gap-1">
                  {order.tickets.map((t) => (
                    <li key={t.id} className="text-xs">
                      {t.ticketType.name}
                      {t.checkIn
                        ? " · checked in"
                        : t.status === "VOID"
                          ? " · void"
                          : ""}
                    </li>
                  ))}
                </ul>
              )}
            </TableCell>
            <TableCell>
              <Badge variant={statusVariant[order.status]}>{order.status}</Badge>
            </TableCell>
            <TableCell className="text-right">
              {formatPence(order.totalInPence)}
            </TableCell>
            <TableCell className="text-right">
              {order.status === "PAID" && (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
