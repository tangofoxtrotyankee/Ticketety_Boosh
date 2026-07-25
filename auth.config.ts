import type { NextAuthConfig } from "next-auth";
import type { Role } from "@prisma/client";

/**
 * Edge-safe Auth.js config: no adapter, no database access.
 * Used by middleware for lightweight session checks; the full config in
 * lib/auth.ts (adapter + email provider) spreads this in.
 */
export const authConfig = {
  secret: process.env.NEXTAUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    verifyRequest: "/login/check-email",
    error: "/login",
  },
  providers: [],
  callbacks: {
    jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: Role }).role ?? "ATTENDEE";
      }
      if (trigger === "update") {
        // role changes require re-login; sessions are short-lived JWTs
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) ?? "";
        session.user.role = (token.role as Role) ?? "ATTENDEE";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
