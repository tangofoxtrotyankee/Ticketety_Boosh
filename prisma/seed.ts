import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: { role: "ADMIN" },
    create: { email: "admin@example.com", name: "Admin", role: "ADMIN" },
  });
  await prisma.user.upsert({
    where: { email: "staff@example.com" },
    update: { role: "STAFF" },
    create: { email: "staff@example.com", name: "Door Staff", role: "STAFF" },
  });

  const startsAt = new Date();
  startsAt.setDate(startsAt.getDate() + 30);
  startsAt.setHours(18, 30, 0, 0);
  const endsAt = new Date(startsAt);
  endsAt.setHours(22, 0, 0, 0);

  const event = await prisma.event.upsert({
    where: { slug: "summer-social-2026" },
    update: {},
    create: {
      slug: "summer-social-2026",
      title: "Summer Social 2026",
      description:
        "Our annual summer get-together: food, drinks, music and awards. Bring your ticket QR code for entry.",
      venue: "The Warehouse, 12 Riverside Way, London",
      startsAt,
      endsAt,
      status: "PUBLISHED",
      capacity: 250,
    },
  });

  const existing = await prisma.ticketType.count({
    where: { eventId: event.id },
  });
  if (existing === 0) {
    await prisma.ticketType.createMany({
      data: [
        {
          eventId: event.id,
          name: "Team (free)",
          priceInPence: 0,
          quantity: 200,
          maxPerOrder: 2,
        },
        {
          eventId: event.id,
          name: "Guest",
          priceInPence: 1500,
          quantity: 50,
          maxPerOrder: 4,
        },
      ],
    });
  }

  console.log(`Seeded admin ${admin.email} and event "${event.title}"`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
