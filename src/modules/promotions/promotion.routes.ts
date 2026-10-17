import { Router } from 'express';
import { promotionController } from './promotion.controller.js';
import { validate } from '../../core/validation/validator.js';
import { createCouponSchema, validateCouponQuerySchema } from './promotion.schema.js';
import { authenticate } from '../../core/authentication/middleware.js';
import { authorize } from '../../core/authorization/guard.js';

export const promotionRouter = Router();

// Public validation endpoint for checkout
promotionRouter.get(
  '/validate',
  validate({ query: validateCouponQuerySchema }),
  promotionController.validateCoupon
);

// Management routes (Admin / Manager)
promotionRouter.get(
  '/',
  authenticate,
  authorize('promotions', 'read'),
  promotionController.list
);

promotionRouter.post(
  '/',
  authenticate,
  authorize('promotions', 'write'),
  validate({ body: createCouponSchema }),
  promotionController.create
);

promotionRouter.delete(
  '/:id',
  authenticate,
  authorize('promotions', 'write'),
  promotionController.delete
);
