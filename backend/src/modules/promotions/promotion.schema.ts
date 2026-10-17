import { z } from 'zod';

export const createCouponSchema = z.object({
  code: z.string().min(3).toUpperCase(),
  discountType: z.enum(['PERCENTAGE', 'FIXED']).default('PERCENTAGE'),
  discountValue: z.coerce.number().positive(),
  minOrderAmount: z.coerce.number().nonnegative().default(0),
  maxDiscountAmount: z.coerce.number().positive().optional().nullable(),
  usageLimit: z.coerce.number().int().positive().optional().nullable(),
  validFrom: z.coerce.date().default(() => new Date()),
  validUntil: z.coerce.date().optional().nullable(),
  isActive: z.boolean().default(true)
});

export const validateCouponQuerySchema = z.object({
  code: z.string().min(1),
  subtotal: z.coerce.number().nonnegative()
});
