import { Router } from 'express';
import { cartController } from './cart.controller.js';
import { validate } from '../../core/validation/validator.js';
import { addToCartSchema, updateCartItemSchema, applyCouponSchema } from './cart.schema.js';
import { optionalAuthenticate } from '../../core/authentication/middleware.js';

export const cartRouter = Router();

cartRouter.use(optionalAuthenticate);

cartRouter.get('/', cartController.getCart);
cartRouter.post('/items', validate({ body: addToCartSchema }), cartController.addItem);
cartRouter.put('/items/:itemId', validate({ body: updateCartItemSchema }), cartController.updateItem);
cartRouter.delete('/items/:itemId', cartController.removeItem);
cartRouter.post('/coupon', validate({ body: applyCouponSchema }), cartController.applyCoupon);
cartRouter.delete('/coupon', cartController.removeCoupon);
