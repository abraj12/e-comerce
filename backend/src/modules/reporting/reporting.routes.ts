import { Router } from 'express';
import { reportingController } from './reporting.controller.js';
import { authenticate } from '../../core/authentication/middleware.js';
import { authorize } from '../../core/authorization/guard.js';

export const reportingRouter = Router();

reportingRouter.use(authenticate);

// Protected routes (Manager / Admin)
reportingRouter.get('/dashboard', authorize('reports', 'read'), reportingController.getDashboard);
reportingRouter.get('/top-products', authorize('reports', 'read'), reportingController.getTopProducts);
reportingRouter.get('/audit-logs', authorize('ADMIN', 'read'), reportingController.getAuditLogs);
