import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

// Edge-safe Auth.js instance (no adapter): reads the JWT session cookie only.
// Role checks here are a first line of defence; every server action and route
// handler re-checks roles server-side via requireRole().
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const role = req.auth?.user?.role;

  const needsAdmin = pathname.startsWith("/admin");
  const needsStaff = pathname.startsWith("/scan");

  if ((needsAdmin || needsStaff) && !req.auth?.user) {
    const login = new URL("/login", req.nextUrl.origin);
    login.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(login);
  }
  if (needsAdmin && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }
  if (needsStaff && role !== "ADMIN" && role !== "STAFF") {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }

  // --- Security headers + nonce-based CSP ---
  const nonce = btoa(crypto.getRandomValues(new Uint8Array(16)).join("-"));
  const csp = [
    "default-src 'self'",
    // strict-dynamic + nonce: Next.js picks the nonce up from this request
    // header and applies it to its inline bootstrap scripts.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https:",
    "font-src 'self'",
    "connect-src 'self' https://api.stripe.com https://checkout.stripe.com",
    "frame-src https://js.stripe.com https://checkout.stripe.com",
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://checkout.stripe.com",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  res.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload"
  );
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set(
    "Permissions-Policy",
    // Camera is needed on /scan for the QR scanner; everything else is off.
    `camera=${needsStaff ? "(self)" : "()"}, microphone=(), geolocation=(), payment=(self)`
  );
  return res;
});

export const config = {
  // Skip static assets; the Stripe webhook must not be redirected or modified.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/webhooks/stripe).*)",
  ],
};
