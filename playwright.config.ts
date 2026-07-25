import { defineConfig } from "@playwright/test";

/**
 * Requires a running app + database:
 *   1. Set DATABASE_URL/DIRECT_URL (+ STRIPE_WEBHOOK_SECRET, e.g. whsec_test)
 *   2. npx prisma migrate deploy && npm run db:seed
 *   3. npm run build && npm run start  (or set PLAYWRIGHT_BASE_URL)
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
});
