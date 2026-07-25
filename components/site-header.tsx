import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { Button, buttonVariants } from "@/components/ui/button";

export async function SiteHeader() {
  const session = await auth();
  const role = session?.user?.role;

  return (
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="text-lg font-semibold">
          TFY <span className="text-primary">Tickets</span>
        </Link>
        <nav aria-label="Main" className="flex items-center gap-2 sm:gap-4">
          <Link
            href="/"
            className="px-2 py-2 text-sm font-semibold hover:text-primary"
          >
            Events
          </Link>
          {(role === "STAFF" || role === "ADMIN") && (
            <Link
              href="/scan"
              className="px-2 py-2 text-sm font-semibold hover:text-primary"
            >
              Scan
            </Link>
          )}
          {role === "ADMIN" && (
            <Link
              href="/admin"
              className="px-2 py-2 text-sm font-semibold hover:text-primary"
            >
              Admin
            </Link>
          )}
          {session?.user ? (
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <Button variant="secondary" size="sm" type="submit">
                Sign out
              </Button>
            </form>
          ) : (
            <Link
              href="/login"
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
