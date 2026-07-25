import type { Metadata } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: {
    default: "TFY Tickets",
    template: "%s · TFY Tickets",
  },
  description: "Tickets for our internal events — browse, book, and check in.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB">
      <body className="flex min-h-screen flex-col font-sans">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <footer className="border-t">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p>TFY Tickets — internal events.</p>
            <a href="/privacy" className="hover:text-primary">
              Privacy notice
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
