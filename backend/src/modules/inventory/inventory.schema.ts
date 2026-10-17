import { z } from 'zod';

export const stockAdjustmentSchema = z.object({
  variantId: z.string().uuid(),
  quantityChange: z.coerce.number().int(), // positive for restock, negative for deduction
  reason: z.enum(['RESTOCK', 'MANUAL_ADJUSTMENT', 'DAMAGED', 'RETURN', 'COUNT_CORRECTION']),
  referenceId: z.string().optional()
});

export const updateThresholdSchema = z.object({
  lowStockThreshold: z.coerce.number().int().nonnegative()
});
