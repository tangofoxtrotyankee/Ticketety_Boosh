import type { Metadata } from "next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Check your email" };

export default function CheckEmailPage() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 sm:px-6">
      <Card>
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            We&apos;ve sent you a sign-in link. It&apos;s valid for 15 minutes
            and can be used once. You can close this tab.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No email after a couple of minutes? Check your spam folder, then
            request a new link.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
