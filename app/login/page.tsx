import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";
import { z } from "zod";
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

export const metadata: Metadata = { title: "Sign in" };

const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  callbackUrl: z
    .string()
    .regex(/^\/(?!\/)/, "Only relative paths are allowed")
    .optional(),
});

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { callbackUrl?: string; error?: string };
}) {
  const session = await auth();
  if (session?.user) redirect("/");

  const hasError = typeof searchParams.error === "string";

  async function requestMagicLink(formData: FormData) {
    "use server";
    const parsed = signInSchema.safeParse({
      email: formData.get("email"),
      callbackUrl: formData.get("callbackUrl") || undefined,
    });
    if (!parsed.success) redirect("/login?error=invalid_email");
    await signIn("resend", {
      email: parsed.data.email,
      redirectTo: parsed.data.callbackUrl ?? "/",
    });
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 sm:px-6">
      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            We&apos;ll email you a one-time sign-in link — no password needed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasError && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>
                {searchParams.error === "invalid_email"
                  ? "That email address doesn't look right — please check it and try again."
                  : "Sign-in failed or the link expired. Please request a new link."}
              </AlertDescription>
            </Alert>
          )}
          <form action={requestMagicLink} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
              />
            </div>
            <input
              type="hidden"
              name="callbackUrl"
              value={searchParams.callbackUrl ?? "/"}
            />
            <Button type="submit">Email me a sign-in link</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
