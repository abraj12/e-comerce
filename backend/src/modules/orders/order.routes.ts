import { Router } from 'express';
import { orderController } from './order.controller.js';
import { validate } from '../../core/validation/validator.js';
import { createOrderSchema, updateOrderStatusSchema } from './order.schema.js';
import { authenticate, optionalAuthenticate } from '../../core/authentication/middleware.js';
import { authorize } from '../../core/authorization/guard.js';

export const orderRouter = Router();

// Checkout & Order creation (allowed for logged-in customers and guest checkout)
orderRouter.post(
  '/checkout',
  optionalAuthenticate,
  validate({ body: createOrderSchema }),
  orderController.create
);

// Order history (requires auth)
orderRouter.get('/', authenticate, orderController.list);

// Safe Public Tracking endpoint (discloses non-sensitive status only)
orderRouter.get('/:orderNumber/track', orderController.track);

// Order details (requires authentication or valid guest order token)
orderRouter.get('/:id', optionalAuthenticate, orderController.getById);

// Order status workflow update (Staff / Manager / Admin)
orderRouter.patch(
  '/:id/status',
  authenticate,
  authorize('orders', 'update'),
  validate({ body: updateOrderStatusSchema }),
  orderController.updateStatus
);
