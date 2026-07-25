import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  /** Seconds until the window resets — use for Retry-After. */
  retryAfterSeconds: number;
}

export interface RateLimiter {
  limit(key: string): Promise<RateLimitResult>;
}

interface WindowSpec {
  max: number;
  windowSeconds: number;
}

function hasUpstash(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

/** Sliding-window limiter backed by Upstash Redis. */
function upstashLimiter(name: string, spec: WindowSpec): RateLimiter {
  const rl = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(spec.max, `${spec.windowSeconds} s`),
    prefix: `rl:${name}`,
  });
  return {
    async limit(key) {
      const res = await rl.limit(key);
      return {
        success: res.success,
        remaining: res.remaining,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((res.reset - Date.now()) / 1000)
        ),
      };
    },
  };
}

/**
 * Sliding-window limiter backed by Postgres: record a hit, count hits inside
 * the window, and periodically prune old rows. Fallback for when Upstash is
 * not configured.
 */
function postgresLimiter(name: string, spec: WindowSpec): RateLimiter {
  return {
    async limit(key) {
      const fullKey = `${name}:${key}`;
      const windowStart = new Date(Date.now() - spec.windowSeconds * 1000);
      try {
        const [, count] = await prisma.$transaction([
          prisma.rateLimitHit.create({ data: { key: fullKey } }),
          prisma.rateLimitHit.count({
            where: { key: fullKey, at: { gte: windowStart } },
          }),
        ]);
        // Opportunistic prune (~2% of calls) keeps the table small without a
        // dedicated job.
        if (count % 50 === 0) {
          await prisma.rateLimitHit.deleteMany({
            where: { key: fullKey, at: { lt: windowStart } },
          });
        }
        return {
          success: count <= spec.max,
          remaining: Math.max(0, spec.max - count),
          retryAfterSeconds: spec.windowSeconds,
        };
      } catch (err) {
        // Fail open: a broken limiter must not take payments down.
        logger.error({ err, limiter: name }, "rate limiter failure");
        return { success: true, remaining: 0, retryAfterSeconds: 0 };
      }
    },
  };
}

function makeLimiter(name: string, spec: WindowSpec): RateLimiter {
  return hasUpstash() ? upstashLimiter(name, spec) : postgresLimiter(name, spec);
}

// One limiter per policy, per the hardening checklist.
export const checkoutIpLimiter = makeLimiter("checkout-ip", {
  max: 5,
  windowSeconds: 60,
});
export const checkoutEmailLimiter = makeLimiter("checkout-email", {
  max: 5,
  windowSeconds: 60,
});
export const magicLinkEmailLimiter = makeLimiter("magic-email", {
  max: 3,
  windowSeconds: 60,
});
export const magicLinkIpLimiter = makeLimiter("magic-ip", {
  max: 10,
  windowSeconds: 3600,
});
export const scanLimiter = makeLimiter("scan", { max: 60, windowSeconds: 60 });
export const globalApiLimiter = makeLimiter("api", {
  max: 100,
  windowSeconds: 60,
});

/** Client IP from proxy headers (Railway sits behind a proxy). */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** 429 response with Retry-After, shared by all API routes. */
export function rateLimitResponse(result: RateLimitResult): Response {
  return Response.json(
    { error: "Too many requests. Please try again shortly." },
    {
      status: 429,
      headers: { "Retry-After": String(result.retryAfterSeconds) },
    }
  );
}
