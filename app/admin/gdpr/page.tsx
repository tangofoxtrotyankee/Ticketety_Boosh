import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const dynamic = "force-dynamic";

const emailSchema = z.string().trim().toLowerCase().email();

async function deleteAttendeeData(formData: FormData) {
  "use server";
  const session = await requireRole("ADMIN");
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    redirect(`/admin/gdpr?error=${encodeURIComponent("Invalid email address.")}`);
  }
  const email = parsed.data;

  // Anonymise rather than hard-delete order rows: financial records must
  // survive, personal data must not.
  const result = await prisma.$transaction(async (tx) => {
    const orders = await tx.order.findMany({ where: { email } });
    for (const order of orders) {
      await tx.order.update({
        where: { id: order.id },
        data: { email: `deleted-${order.id}@redacted.invalid`, userId: null },
      });
      await tx.ticket.updateMany({
        where: { orderId: order.id },
        data: { attendeeName: null },
      });
    }
    const user = await tx.user.findUnique({ where: { email } });
    if (user) {
      await tx.session.deleteMany({ where: { userId: user.id } });
      await tx.account.deleteMany({ where: { userId: user.id } });
      // CheckIn.byUserId references staff — attendees have none; safe to delete.
      await tx.user.delete({ where: { id: user.id } }).catch(() => {
        // Staff/admin users with check-in history can't be deleted silently.
        throw new Error(
          "This user has staff activity — remove their role/history first."
        );
      });
    }
    return { orders: orders.length, hadUser: Boolean(user) };
  });

  await audit({
    actorId: session.user.id,
    action: "gdpr.delete",
    entity: "User",
    entityId: email,
    meta: result,
  });
  redirect(
    `/admin/gdpr?notice=${encodeURIComponent(
      `Deleted/anonymised data for ${email} (${result.orders} orders).`
    )}`
  );
}

export default async function GdprPage({
  searchParams,
}: {
  searchParams: { error?: string; notice?: string };
}) {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Attendee data (GDPR)</h1>
      {searchParams.error && (
        <Alert variant="destructive">
          <AlertDescription>{searchParams.error}</AlertDescription>
        </Alert>
      )}
      {searchParams.notice && (
        <Alert variant="success">
          <AlertDescription>{searchParams.notice}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Export attendee data</CardTitle>
          <CardDescription>
            Downloads everything we hold for an email address as JSON.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action="/api/admin/gdpr/export"
            method="GET"
            className="flex flex-col gap-4 sm:flex-row sm:items-end"
          >
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="export-email">Email address</Label>
              <Input
                id="export-email"
                name="email"
                type="email"
                required
                placeholder="attendee@example.com"
              />
            </div>
            <Button type="submit" variant="secondary">
              Export JSON
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Delete attendee data</CardTitle>
          <CardDescription>
            Anonymises their orders and tickets and removes their account.
            Order financial records are kept without personal data. This cannot
            be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={deleteAttendeeData}
            className="flex flex-col gap-4 sm:flex-row sm:items-end"
          >
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="delete-email">Email address</Label>
              <Input
                id="delete-email"
                name="email"
                type="email"
                required
                placeholder="attendee@example.com"
              />
            </div>
            <Button type="submit" variant="destructive">
              Delete data
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
