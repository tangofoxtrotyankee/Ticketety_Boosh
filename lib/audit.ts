import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { Prisma } from "@prisma/client";

/**
 * Record an audit log entry. Never throws — auditing must not break the
 * action being audited (failures are logged instead).
 */
export async function audit(entry: {
  actorId?: string | null;
  action: string;
  entity: string;
  entityId: string;
  meta?: Prisma.InputJsonValue;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        meta: entry.meta,
      },
    });
  } catch (err) {
    logger.error({ err, entry: entry.action }, "audit log write failed");
  }
}
