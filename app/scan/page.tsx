import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Scanner } from "@/components/scanner";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Check-in scanner" };

export default async function ScanPage() {
  // Server-side enforcement, independent of middleware.
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/scan");
  if (session.user.role !== "STAFF" && session.user.role !== "ADMIN") {
    redirect("/");
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-semibold">Door check-in</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Point the camera at a ticket QR code, or type the code manually.
      </p>
      <div className="mt-6">
        <Scanner />
      </div>
    </div>
  );
}
