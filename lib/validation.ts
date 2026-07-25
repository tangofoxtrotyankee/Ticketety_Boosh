import { z } from "zod";
import { TICKET_CODE_REGEX } from "@/lib/codes";

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens")
  .min(3)
  .max(80);

const datetimeLocal = z
  .string()
  .min(1, "Required")
  .transform((v, ctx) => {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: "custom", message: "Invalid date" });
      return z.NEVER;
    }
    return d;
  });

const optionalDatetimeLocal = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: "custom", message: "Invalid date" });
      return z.NEVER;
    }
    return d;
  });

export const eventFormSchema = z
  .object({
    title: z.string().trim().min(3).max(140),
    slug: slugSchema,
    description: z.string().trim().min(10).max(10_000),
    venue: z.string().trim().min(3).max(240),
    startsAt: datetimeLocal,
    endsAt: datetimeLocal,
    coverImageUrl: z
      .union([z.literal(""), z.string().url().max(500)])
      .transform((v) => (v === "" ? null : v)),
    capacity: z
      .union([z.literal(""), z.coerce.number().int().min(1).max(1_000_000)])
      .transform((v) => (v === "" ? null : v)),
  })
  .refine((data) => data.endsAt > data.startsAt, {
    message: "End must be after start",
    path: ["endsAt"],
  });

export const ticketTypeFormSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    priceInPence: z.coerce.number().int().min(0).max(10_000_00),
    quantity: z.coerce.number().int().min(1).max(1_000_000),
    maxPerOrder: z.coerce.number().int().min(1).max(100),
    salesStart: optionalDatetimeLocal,
    salesEnd: optionalDatetimeLocal,
  })
  .refine(
    (d) => !d.salesStart || !d.salesEnd || d.salesEnd > d.salesStart,
    { message: "Sales end must be after sales start", path: ["salesEnd"] }
  );

export const checkoutSchema = z.object({
  eventId: z.string().min(1).max(64),
  email: z.string().trim().toLowerCase().email().max(254),
  idempotencyKey: z.string().uuid(),
  items: z
    .array(
      z.object({
        ticketTypeId: z.string().min(1).max(64),
        quantity: z.number().int().min(1).max(100),
      })
    )
    .min(1)
    .max(10),
});

export const scanSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(TICKET_CODE_REGEX, "Invalid code format"),
});

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** First human-readable message from a Zod error. */
export function firstZodMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input";
}
