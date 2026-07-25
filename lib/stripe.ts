import Stripe from "stripe";

let client: Stripe | null = null;

/** Lazily constructed so builds and non-payment paths don't need the key. */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  if (!client) {
    // No apiVersion override: the SDK pins the version it ships with.
    client = new Stripe(key, { typescript: true });
  }
  return client;
}
