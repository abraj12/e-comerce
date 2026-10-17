import { Request, Response, NextFunction } from 'express';
import { checkPermission } from './casbin.js';
import { recordAuditEvent } from '../logging/audit.js';

export function authorize(resource: string, action: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized: Authentication required before checking permissions'
      });
      return;
    }

    const { role, userId } = req.user;
    const allowed = await checkPermission(role, resource, action);

    if (!allowed) {
      await recordAuditEvent({
        userId,
        action: 'ACCESS_DENIED',
        entityType: resource,
        details: { action, requiredResource: resource, userRole: role },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      res.status(403).json({
        success: false,
        error: `Forbidden: Role '${role}' lacks permission '${action}' on '${resource}'`
      });
      return;
    }

    next();
  };
}
