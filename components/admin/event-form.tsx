import type { Event } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function toDatetimeLocal(date: Date | null | undefined): string {
  if (!date) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function Field({
  label,
  htmlFor,
  children,
  hint,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function EventForm({
  action,
  event,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  event?: Event;
  submitLabel: string;
}) {
  return (
    <form action={action} className="flex max-w-2xl flex-col gap-6">
      <Field label="Title" htmlFor="title">
        <Input
          id="title"
          name="title"
          required
          maxLength={140}
          defaultValue={event?.title ?? ""}
        />
      </Field>
      <Field
        label="Slug"
        htmlFor="slug"
        hint="Public URL path, e.g. summer-social-2026 → /events/summer-social-2026"
      >
        <Input
          id="slug"
          name="slug"
          required
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          maxLength={80}
          defaultValue={event?.slug ?? ""}
        />
      </Field>
      <Field label="Description" htmlFor="description">
        <Textarea
          id="description"
          name="description"
          required
          rows={6}
          defaultValue={event?.description ?? ""}
        />
      </Field>
      <Field label="Venue" htmlFor="venue">
        <Input
          id="venue"
          name="venue"
          required
          maxLength={240}
          defaultValue={event?.venue ?? ""}
        />
      </Field>
      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Starts" htmlFor="startsAt">
          <Input
            id="startsAt"
            name="startsAt"
            type="datetime-local"
            required
            defaultValue={toDatetimeLocal(event?.startsAt)}
          />
        </Field>
        <Field label="Ends" htmlFor="endsAt">
          <Input
            id="endsAt"
            name="endsAt"
            type="datetime-local"
            required
            defaultValue={toDatetimeLocal(event?.endsAt)}
          />
        </Field>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <Field
          label="Cover image URL"
          htmlFor="coverImageUrl"
          hint="Optional — shown on the public event card"
        >
          <Input
            id="coverImageUrl"
            name="coverImageUrl"
            type="url"
            defaultValue={event?.coverImageUrl ?? ""}
          />
        </Field>
        <Field label="Capacity" htmlFor="capacity" hint="Optional overall cap">
          <Input
            id="capacity"
            name="capacity"
            type="number"
            min={1}
            defaultValue={event?.capacity ?? ""}
          />
        </Field>
      </div>
      <div>
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}
