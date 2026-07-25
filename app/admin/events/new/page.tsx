import { createEvent } from "@/app/admin/actions";
import { EventForm } from "@/components/admin/event-form";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const dynamic = "force-dynamic";

export default function NewEventPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">New event</h1>
      {searchParams.error && (
        <Alert variant="destructive" className="max-w-2xl">
          <AlertDescription>{searchParams.error}</AlertDescription>
        </Alert>
      )}
      <EventForm action={createEvent} submitLabel="Create event" />
      <p className="text-sm text-muted-foreground">
        Events start as drafts — add ticket types, then publish from the event
        page.
      </p>
    </div>
  );
}
