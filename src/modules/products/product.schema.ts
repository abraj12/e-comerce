import { z } from 'zod';

export const variantInputSchema = z.object({
  name: z.string().min(1, 'Variant name is required'),
  sku: z.string().min(1, 'SKU is required'),
  price: z.coerce.number().positive('Price must be greater than 0'),
  compareAtPrice: z.coerce.number().positive().optional().nullable(),
  options: z.record(z.string(), z.string()).default({}),
  initialStock: z.coerce.number().int().nonnegative().default(0),
  lowStockThreshold: z.coerce.number().int().nonnegative().default(5)
});

export const createProductSchema = z.object({
  name: z.string().min(2, 'Product name must be at least 2 characters'),
  slug: z.string().optional(),
  description: z.string().optional(),
  basePrice: z.coerce.number().positive('Base price must be greater than 0'),
  sku: z.string().min(1, 'Product master SKU is required'),
  categoryId: z.string().uuid().optional().nullable(),
  images: z.array(z.string()).default([]),
  attributes: z.record(z.string(), z.any()).default({}),
  variants: z.array(variantInputSchema).optional()
});

export const updateProductSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  basePrice: z.coerce.number().positive().optional(),
  categoryId: z.string().uuid().optional().nullable(),
  images: z.array(z.string()).optional(),
  attributes: z.record(z.string(), z.any()).optional(),
  isActive: z.boolean().optional()
});

export const productQuerySchema = z.object({
  search: z.string().optional(),
  categoryId: z.string().optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  inStockOnly: z.preprocess((val) => val === 'true' || val === true, z.boolean().optional()),
  sortBy: z.enum(['price_asc', 'price_desc', 'newest', 'name']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20)
});
