import { prisma } from '../database/prisma.js';
import { logger } from './logger.js';

export interface AuditEvent {
  userId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export async function recordAuditEvent(event: AuditEvent): Promise<void> {
  try {
    const isUuid =
      typeof event.userId === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(event.userId);

    await prisma.auditLog.create({
      data: {
        userId: isUuid ? event.userId : null,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        details: event.details ? JSON.stringify(event.details) : null,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent
      }
    });

    logger.info(`[AUDIT] ${event.action} on ${event.entityType}`, {
      userId: event.userId,
      entityId: event.entityId,
      action: event.action
    });
  } catch (error) {
    logger.error('Failed to persist audit log entry', error as Error, { event });
  }
}
