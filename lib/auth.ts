import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";
import { sendMagicLinkEmail } from "@/lib/email";
import {
  magicLinkEmailLimiter,
  magicLinkIpLimiter,
} from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.EMAIL_FROM,
      maxAge: 15 * 60, // magic links valid for 15 minutes
      async sendVerificationRequest({ identifier, url, request }) {
        const email = identifier.toLowerCase();
        const ip =
          request?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          "unknown";
        const [byEmail, byIp] = await Promise.all([
          magicLinkEmailLimiter.limit(email),
          magicLinkIpLimiter.limit(ip),
        ]);
        if (!byEmail.success || !byIp.success) {
          logger.warn({ email }, "magic link rate limited");
          throw new Error("Too many sign-in attempts. Please try again later.");
        }
        await sendMagicLinkEmail(email, url);
      },
    }),
  ],
});

/** Server-side guard: returns the session or null. */
export async function getSession() {
  return auth();
}

/** Require a signed-in user with one of the given roles; throws otherwise. */
export async function requireRole(...roles: Array<"ADMIN" | "STAFF">) {
  const session = await auth();
  if (!session?.user?.id) throw new AuthError("UNAUTHENTICATED");
  const allowed: string[] = [...roles];
  // ADMIN always satisfies a STAFF requirement.
  if (allowed.includes("STAFF")) allowed.push("ADMIN");
  if (!allowed.includes(session.user.role)) throw new AuthError("FORBIDDEN");
  return session;
}

export class AuthError extends Error {
  constructor(public code: "UNAUTHENTICATED" | "FORBIDDEN") {
    super(code);
    this.name = "AuthError";
  }
}
