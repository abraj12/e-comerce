import { z } from 'zod';

export const checkoutAddressSchema = z.object({
  recipientName: z.string().min(2),
  phone: z.string().min(8),
  streetAddress: z.string().min(5),
  city: z.string().min(2),
  state: z.string().min(2),
  pinCode: z.string().min(3)
});

export const createOrderSchema = z.object({
  cartId: z.string().uuid().optional(),
  deliveryType: z.enum(['LOCAL_DELIVERY', 'STORE_PICKUP']).default('LOCAL_DELIVERY'),
  shippingAddress: checkoutAddressSchema.optional(),
  paymentMethod: z.enum(['CASH_ON_DELIVERY', 'ONLINE_RAZORPAY', 'ONLINE_STRIPE', 'MOCK_GATEWAY']).default('CASH_ON_DELIVERY'),
  customerEmail: z.string().email(),
  customerPhone: z.string().min(8),
  couponCode: z.string().optional(),
  notes: z.string().optional()
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(['PENDING', 'PAID', 'PROCESSING', 'DISPATCHED', 'DELIVERED', 'CANCELLED', 'REFUNDED']),
  reason: z.string().optional()
});
