import { Router } from 'express';
import { deliveryController } from './delivery.controller.js';
import { validate } from '../../core/validation/validator.js';
import {
  createDeliveryZoneSchema,
  checkPinCodeQuerySchema,
  assignDeliveryStaffSchema,
  updateDeliveryStatusSchema
} from './delivery.schema.js';
import { authenticate } from '../../core/authentication/middleware.js';
import { authorize } from '../../core/authorization/guard.js';

export const deliveryRouter = Router();

// Public check for checkout
deliveryRouter.get('/zones', deliveryController.listZones);
deliveryRouter.get(
  '/check',
  validate({ query: checkPinCodeQuerySchema }),
  deliveryController.checkAvailability
);

// Management (Admin / Manager)
deliveryRouter.post(
  '/zones',
  authenticate,
  authorize('delivery', 'write'),
  validate({ body: createDeliveryZoneSchema }),
  deliveryController.createZone
);

deliveryRouter.delete(
  '/zones/:id',
  authenticate,
  authorize('delivery', 'write'),
  deliveryController.deleteZone
);

deliveryRouter.get(
  '/staff',
  authenticate,
  authorize('delivery', 'read'),
  deliveryController.listStaff
);

deliveryRouter.post(
  '/assign',
  authenticate,
  authorize('delivery', 'write'),
  validate({ body: assignDeliveryStaffSchema }),
  deliveryController.assignStaff
);

// Delivery status update (Delivery Staff or Manager)
deliveryRouter.patch(
  '/status/:orderId',
  authenticate,
  authorize('delivery', 'update'),
  validate({ body: updateDeliveryStatusSchema }),
  deliveryController.updateStatus
);
