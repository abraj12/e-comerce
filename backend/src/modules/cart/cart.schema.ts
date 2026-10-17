import { z } from 'zod';

export const addToCartSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.coerce.number().int().positive().default(1)
});

export const updateCartItemSchema = z.object({
  quantity: z.coerce.number().int().positive()
});

export const applyCouponSchema = z.object({
  couponCode: z.string().min(1)
});
