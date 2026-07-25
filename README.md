# TFY Tickets

Self-hosted event ticketing for a single organisation running its own internal
events — Ticket Tailor / Eventbrite style, without the marketplace. Free and
paid tickets, Stripe Checkout, QR e-tickets by email, and a door check-in
scanner.

## Stack

- **Next.js 14** (App Router, TypeScript strict) — public pages, admin, and API in one app
- **Prisma → Postgres (Neon)** — pooled connection at runtime, direct URL for migrations
- **Auth.js v5** — passwordless email magic links via Resend; roles `ADMIN` / `STAFF` / `ATTENDEE`
- **Stripe Checkout (hosted)** + webhooks — no card data touches the server (SAQ-A); webhooks are the source of truth
- **Resend** — magic links and order confirmations (inline QR PNGs + `.ics` attachment)
- **Tailwind + shadcn-style components** — light, flat UI with a purple `#a370fc` accent
- **Rate limiting** — Upstash Redis if configured, otherwise a Postgres sliding-window fallback (same interface)
- **pino** structured logging with request ids; **Zod** validation at every boundary

## Architecture at a glance

```
Browser ──► Next.js on Railway (app + API routes)
                │
                ├── Prisma ──► Neon Postgres (pooled)
                ├── Stripe   (Checkout Sessions + webhooks)
                ├── Resend   (magic links, QR ticket emails)
                └── Upstash Redis (rate limits; Postgres fallback)
```

Key correctness properties:

- **No overselling** — ticket allocation is a single transaction around a
  conditional `UPDATE "TicketType" SET sold = sold + n WHERE sold + n <= quantity`;
  zero affected rows means sold out and the whole order rolls back.
- **Webhook is the truth** — an order is only `PAID` when the verified
  `checkout.session.completed` event lands. The Stripe event id is inserted
  into `WebhookEvent` inside the same transaction as the state change, so
  duplicate deliveries no-op. The success page just polls until then.
- **Server-side prices** — Checkout line items are built from DB values;
  client input is quantities only.
- **Holds & expiry** — pending orders hold inventory for 30 minutes (Stripe's
  minimum Checkout Session lifetime), matching the session's `expires_at`.
  The cron route expires stale holds (with a grace period) and releases seats.
- **Atomic check-in** — the unique constraint on `CheckIn.ticketId` is the
  double-scan guard; codes are 128-bit random base32, compared in constant time.

## Local development

### 1. Prerequisites

- Node 20+
- A [Neon](https://neon.tech) Postgres project (or any Postgres)
- [Stripe](https://stripe.com) account + [Stripe CLI](https://stripe.com/docs/stripe-cli)
- [Resend](https://resend.com) API key (emails); any verified sender works for dev

### 2. Configure environment

```bash
cp .env.example .env
# fill in every value — comments in the file explain each one
```

Use the Neon **pooled** connection string for `DATABASE_URL` and the
**direct** string for `DIRECT_URL` (migrations bypass pgbouncer).

### 3. Install, migrate, seed

```bash
npm install
npx prisma migrate deploy   # or: npx prisma migrate dev
npm run db:seed             # admin@example.com (ADMIN), staff@example.com (STAFF), sample event
npm run dev
```

Sign in as `admin@example.com` via the magic link (check the Resend dashboard
or your inbox).

### 4. Stripe webhooks locally

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
# copy the whsec_... it prints into STRIPE_WEBHOOK_SECRET and restart dev
```

Test cards: `4242 4242 4242 4242`, any future expiry/CVC.

### 5. Tests

```bash
npm run lint && npm run build
# e2e (needs the stack from steps 2–4 running via `npm run start` or `npm run dev`):
npm run test:e2e
```

The Playwright suite covers a free-ticket purchase end-to-end and a mocked
(signed) `checkout.session.completed` webhook completing a paid order,
including duplicate-delivery idempotency.

## Deploying to Railway

1. **Neon**: create the production database; note pooled + direct URLs.
2. **Railway**: new service from this repo.
   - Build: `npm run build` · Start: `npm run start`
   - Pre-deploy/release command: `npx prisma migrate deploy`
   - Set every variable from `.env.example`.
3. **Stripe**: add a webhook endpoint `https://<your-domain>/api/webhooks/stripe`
   subscribed to `checkout.session.completed`, `checkout.session.expired`,
   `charge.refunded`; put its signing secret in `STRIPE_WEBHOOK_SECRET`.
4. **Resend**: verify your sending domain (add the SPF + DKIM records it
   gives you); set `EMAIL_FROM` to an address on that domain.
5. **Cron**: schedule a job every 5 minutes:

   ```bash
   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/expire-orders
   ```

   (Railway cron, or any scheduler that can send the header.)

## Go-live checklist

- [ ] Swap `STRIPE_SECRET_KEY` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` from test to **live** keys
- [ ] Create the **live-mode** webhook endpoint in the Stripe dashboard and update `STRIPE_WEBHOOK_SECRET`
- [ ] `NEXTAUTH_URL` / `NEXT_PUBLIC_APP_URL` set to the production domain (https)
- [ ] Fresh `NEXTAUTH_SECRET` and `CRON_SECRET` (32+ random bytes each)
- [ ] Resend domain verified — SPF + DKIM green — and `EMAIL_FROM` matches it
- [ ] Cron job live and returning `{"expired":0}`
- [ ] `/api/health` returns `{"status":"ok"}` from the deployed URL
- [ ] Promote your real admin: sign in once, then set `role = 'ADMIN'` on your user row (SQL or Prisma Studio) and re-login
- [ ] Buy a test ticket end-to-end in live mode with a real card and refund it from the admin

## Security notes

- `/admin/**` (ADMIN) and `/scan/**` (STAFF/ADMIN) are enforced in middleware
  **and** re-checked in every server action and route handler.
- Security headers + a nonce-based CSP (self + Stripe only) are set in
  `middleware.ts`; HSTS, `X-Frame-Options: DENY`, no-sniff, strict referrer.
- Rate limits: checkout 5/min per IP & email · magic links 3/min per email,
  10/hr per IP · scans 60/min per staff session · 100/min per IP on public
  APIs — all return `429` with `Retry-After`.
- Ticket codes come from `crypto.randomBytes(16)` (base32); the scan endpoint
  compares them constant-time and rejects reuse atomically.
- Admin actions (publish, refunds, exports, GDPR ops, check-ins) are written
  to the audit log, visible at `/admin/audit`.
- GDPR: only name + email are collected; `/admin/gdpr` exports or
  deletes/anonymises an attendee's data; `/privacy` documents processing.

## Scheduled maintenance

`GET /api/cron/expire-orders` (bearer-authenticated) releases inventory held
by abandoned checkouts. Everything else is event-driven via Stripe webhooks.
