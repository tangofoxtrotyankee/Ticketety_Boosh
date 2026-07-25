import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  updateEvent,
  addTicketType,
  updateTicketType,
  deleteTicketType,
} from "@/app/admin/actions";
import { EventForm, toDatetimeLocal } from "@/components/admin/event-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { TicketType } from "@prisma/client";

export const dynamic = "force-dynamic";

function TicketTypeFields({ tt }: { tt?: TicketType }) {
  const id = tt?.id ?? "new";
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`name-${id}`}>Name</Label>
        <Input id={`name-${id}`} name="name" required defaultValue={tt?.name ?? ""} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`price-${id}`}>Price (pence, 0 = free)</Label>
        <Input
          id={`price-${id}`}
          name="priceInPence"
          type="number"
          min={0}
          required
          defaultValue={tt?.priceInPence ?? 0}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`quantity-${id}`}>Quantity</Label>
        <Input
          id={`quantity-${id}`}
          name="quantity"
          type="number"
          min={1}
          required
          defaultValue={tt?.quantity ?? 50}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`maxPerOrder-${id}`}>Max per order</Label>
        <Input
          id={`maxPerOrder-${id}`}
          name="maxPerOrder"
          type="number"
          min={1}
          required
          defaultValue={tt?.maxPerOrder ?? 10}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`salesStart-${id}`}>Sales start (optional)</Label>
        <Input
          id={`salesStart-${id}`}
          name="salesStart"
          type="datetime-local"
          defaultValue={toDatetimeLocal(tt?.salesStart)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`salesEnd-${id}`}>Sales end (optional)</Label>
        <Input
          id={`salesEnd-${id}`}
          name="salesEnd"
          type="datetime-local"
          defaultValue={toDatetimeLocal(tt?.salesEnd)}
        />
      </div>
    </div>
  );
}

export default async function EditEventPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const event = await prisma.event.findUnique({
    where: { id: params.id },
    include: { ticketTypes: { orderBy: { priceInPence: "asc" } } },
  });
  if (!event) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Edit: {event.title}</h1>
        <Link
          href={`/admin/events/${event.id}`}
          className="text-sm font-semibold text-primary hover:underline"
        >
          Back to event
        </Link>
      </div>
      {searchParams.error && (
        <Alert variant="destructive" className="max-w-2xl">
          <AlertDescription>{searchParams.error}</AlertDescription>
        </Alert>
      )}
      <EventForm
        action={updateEvent.bind(null, event.id)}
        event={event}
        submitLabel="Save changes"
      />

      <Separator className="my-2" />

      <h2 className="text-xl font-semibold">Ticket types</h2>
      {event.ticketTypes.map((tt) => (
        <Card key={tt.id}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{tt.name}</CardTitle>
            <CardDescription>
              {tt.sold} sold of {tt.quantity}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <form
              action={updateTicketType.bind(null, event.id, tt.id)}
              className="flex flex-col gap-4"
            >
              <TicketTypeFields tt={tt} />
              <div>
                <Button type="submit" variant="secondary" size="sm">
                  Save ticket type
                </Button>
              </div>
            </form>
            {tt.sold === 0 && (
              <form action={deleteTicketType.bind(null, event.id, tt.id)}>
                <Button type="submit" variant="destructive" size="sm">
                  Delete ticket type
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add ticket type</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            action={addTicketType.bind(null, event.id)}
            className="flex flex-col gap-4"
          >
            <TicketTypeFields />
            <div>
              <Button type="submit" size="sm">
                Add ticket type
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
