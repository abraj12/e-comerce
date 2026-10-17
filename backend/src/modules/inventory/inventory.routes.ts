import { Router } from 'express';
import { inventoryController } from './inventory.controller.js';
import { validate } from '../../core/validation/validator.js';
import { stockAdjustmentSchema } from './inventory.schema.js';
import { authenticate } from '../../core/authentication/middleware.js';
import { authorize } from '../../core/authorization/guard.js';

export const inventoryRouter = Router();

// Protected routes (Staff / Manager / Admin)
inventoryRouter.post(
  '/adjust',
  authenticate,
  authorize('inventory', 'write'),
  validate({ body: stockAdjustmentSchema }),
  inventoryController.adjustStock
);

inventoryRouter.get(
  '/low-stock',
  authenticate,
  authorize('inventory', 'read'),
  inventoryController.getLowStock
);

inventoryRouter.get(
  '/logs',
  authenticate,
  authorize('inventory', 'read'),
  inventoryController.getLogs
);
