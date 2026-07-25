"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import {
  eventFormSchema,
  ticketTypeFormSchema,
  firstZodMessage,
} from "@/lib/validation";

function backWithError(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function revalidatePublic(slug?: string) {
  revalidatePath("/");
  if (slug) revalidatePath(`/events/${slug}`);
}

function parseEventForm(formData: FormData) {
  return eventFormSchema.safeParse({
    title: formData.get("title"),
    slug: formData.get("slug"),
    description: formData.get("description"),
    venue: formData.get("venue"),
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt"),
    coverImageUrl: formData.get("coverImageUrl") ?? "",
    capacity: formData.get("capacity") ?? "",
  });
}

export async function createEvent(formData: FormData) {
  const session = await requireRole("ADMIN");
  const parsed = parseEventForm(formData);
  if (!parsed.success) {
    backWithError("/admin/events/new", firstZodMessage(parsed.error));
  }
  let eventId: string;
  try {
    const event = await prisma.event.create({ data: parsed.data });
    eventId = event.id;
    await audit({
      actorId: session.user.id,
      action: "event.create",
      entity: "Event",
      entityId: event.id,
      meta: { title: event.title, slug: event.slug },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      backWithError("/admin/events/new", "That slug is already in use.");
    }
    logger.error({ err }, "event create failed");
    backWithError("/admin/events/new", "Could not create the event.");
  }
  redirect(`/admin/events/${eventId}`);
}

export async function updateEvent(eventId: string, formData: FormData) {
  const session = await requireRole("ADMIN");
  const editPath = `/admin/events/${eventId}/edit`;
  const parsed = parseEventForm(formData);
  if (!parsed.success) backWithError(editPath, firstZodMessage(parsed.error));
  try {
    const event = await prisma.event.update({
      where: { id: eventId },
      data: parsed.data,
    });
    await audit({
      actorId: session.user.id,
      action: "event.update",
      entity: "Event",
      entityId: event.id,
      meta: { title: event.title },
    });
    revalidatePublic(event.slug);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      backWithError(editPath, "That slug is already in use.");
    }
    logger.error({ err, eventId }, "event update failed");
    backWithError(editPath, "Could not save the event.");
  }
  redirect(`/admin/events/${eventId}`);
}

async function setEventStatus(
  eventId: string,
  status: "PUBLISHED" | "CANCELLED" | "COMPLETED" | "DRAFT",
  action: string
) {
  const session = await requireRole("ADMIN");
  const event = await prisma.event.update({
    where: { id: eventId },
    data: { status },
  });
  await audit({
    actorId: session.user.id,
    action,
    entity: "Event",
    entityId: eventId,
    meta: { status },
  });
  revalidatePublic(event.slug);
  revalidatePath(`/admin/events/${eventId}`);
}

export async function publishEvent(eventId: string) {
  const count = await prisma.ticketType.count({ where: { eventId } });
  if (count === 0) {
    backWithError(
      `/admin/events/${eventId}`,
      "Add at least one ticket type before publishing."
    );
  }
  await setEventStatus(eventId, "PUBLISHED", "event.publish");
}

export async function unpublishEvent(eventId: string) {
  await setEventStatus(eventId, "DRAFT", "event.unpublish");
}

export async function cancelEvent(eventId: string) {
  await setEventStatus(eventId, "CANCELLED", "event.cancel");
}

export async function completeEvent(eventId: string) {
  await setEventStatus(eventId, "COMPLETED", "event.complete");
}

function parseTicketTypeForm(formData: FormData) {
  return ticketTypeFormSchema.safeParse({
    name: formData.get("name"),
    priceInPence: formData.get("priceInPence"),
    quantity: formData.get("quantity"),
    maxPerOrder: formData.get("maxPerOrder"),
    salesStart: (formData.get("salesStart") as string) || undefined,
    salesEnd: (formData.get("salesEnd") as string) || undefined,
  });
}

export async function addTicketType(eventId: string, formData: FormData) {
  const session = await requireRole("ADMIN");
  const editPath = `/admin/events/${eventId}/edit`;
  const parsed = parseTicketTypeForm(formData);
  if (!parsed.success) backWithError(editPath, firstZodMessage(parsed.error));
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) backWithError("/admin/events", "Event not found.");
  const tt = await prisma.ticketType.create({
    data: { ...parsed.data, eventId },
  });
  await audit({
    actorId: session.user.id,
    action: "ticketType.create",
    entity: "TicketType",
    entityId: tt.id,
    meta: { eventId, name: tt.name, priceInPence: tt.priceInPence },
  });
  revalidatePublic(event.slug);
  redirect(editPath);
}

export async function updateTicketType(
  eventId: string,
  ticketTypeId: string,
  formData: FormData
) {
  const session = await requireRole("ADMIN");
  const editPath = `/admin/events/${eventId}/edit`;
  const parsed = parseTicketTypeForm(formData);
  if (!parsed.success) backWithError(editPath, firstZodMessage(parsed.error));
  const existing = await prisma.ticketType.findUnique({
    where: { id: ticketTypeId },
    include: { event: true },
  });
  if (!existing || existing.eventId !== eventId) {
    backWithError(editPath, "Ticket type not found.");
  }
  if (parsed.data.quantity < existing.sold) {
    backWithError(
      editPath,
      `Quantity can't go below the ${existing.sold} already sold.`
    );
  }
  await prisma.ticketType.update({
    where: { id: ticketTypeId },
    data: parsed.data,
  });
  await audit({
    actorId: session.user.id,
    action: "ticketType.update",
    entity: "TicketType",
    entityId: ticketTypeId,
    meta: { eventId, name: parsed.data.name },
  });
  revalidatePublic(existing.event.slug);
  redirect(editPath);
}

export async function deleteTicketType(eventId: string, ticketTypeId: string) {
  const session = await requireRole("ADMIN");
  const editPath = `/admin/events/${eventId}/edit`;
  const existing = await prisma.ticketType.findUnique({
    where: { id: ticketTypeId },
    include: { event: true, _count: { select: { tickets: true, orderItems: true } } },
  });
  if (!existing || existing.eventId !== eventId) {
    backWithError(editPath, "Ticket type not found.");
  }
  if (existing.sold > 0 || existing._count.tickets > 0 || existing._count.orderItems > 0) {
    backWithError(
      editPath,
      "This ticket type has sales and can't be deleted — reduce quantity instead."
    );
  }
  await prisma.ticketType.delete({ where: { id: ticketTypeId } });
  await audit({
    actorId: session.user.id,
    action: "ticketType.delete",
    entity: "TicketType",
    entityId: ticketTypeId,
    meta: { eventId, name: existing.name },
  });
  revalidatePublic(existing.event.slug);
  redirect(editPath);
}
