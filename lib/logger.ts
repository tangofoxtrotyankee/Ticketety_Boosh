import pino from "pino";
import { randomUUID } from "crypto";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { app: "tfy-tickets" },
  redact: {
    paths: ["*.card", "*.password", "*.token", "req.headers.authorization"],
    censor: "[redacted]",
  },
});

/** Per-request child logger with a request id for correlation. */
export function requestLogger(context: Record<string, unknown> = {}) {
  return logger.child({ requestId: randomUUID(), ...context });
}
