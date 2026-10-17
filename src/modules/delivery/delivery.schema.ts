import { z } from 'zod';

export const createDeliveryZoneSchema = z.object({
  name: z.string().min(2),
  pinCodes: z.array(z.string().min(3)),
  deliveryFee: z.coerce.number().nonnegative(),
  minOrderForFreeDelivery: z.coerce.number().nonnegative().optional().nullable(),
  estimatedDeliveryHours: z.coerce.number().int().positive().default(24)
});

export const checkPinCodeQuerySchema = z.object({
  pinCode: z.string().min(3),
  orderSubtotal: z.coerce.number().nonnegative().optional().default(0)
});

export const assignDeliveryStaffSchema = z.object({
  orderId: z.string().uuid(),
  deliveryStaffId: z.string().uuid()
});

export const updateDeliveryStatusSchema = z.object({
  status: z.enum(['PROCESSING', 'DISPATCHED', 'DELIVERED'])
});
