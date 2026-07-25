import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side enforcement, independent of middleware.
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/admin");
  if (session.user.role !== "ADMIN") redirect("/");

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <nav
        aria-label="Admin"
        className="mb-6 flex items-center gap-4 border-b pb-4 text-sm font-semibold"
      >
        <span className="rounded-sm bg-primary px-2 py-0.5 text-xs uppercase tracking-wide text-primary-foreground">
          Admin
        </span>
        <Link href="/admin" className="hover:text-primary">
          Dashboard
        </Link>
        <Link href="/admin/events" className="hover:text-primary">
          Events
        </Link>
        <Link href="/admin/audit" className="hover:text-primary">
          Audit log
        </Link>
      </nav>
      {children}
    </div>
  );
}
