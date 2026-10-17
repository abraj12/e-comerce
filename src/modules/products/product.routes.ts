import { Router } from 'express';
import { productController } from './product.controller.js';
import { validate } from '../../core/validation/validator.js';
import { createProductSchema, updateProductSchema, productQuerySchema } from './product.schema.js';
import { authenticate } from '../../core/authentication/middleware.js';
import { authorize } from '../../core/authorization/guard.js';
import { uploadMiddleware } from '../../core/storage/storageProvider.js';

export const productRouter = Router();

// Public routes
productRouter.get('/', validate({ query: productQuerySchema }), productController.list);
productRouter.get('/:slug', productController.getBySlug);

// Protected routes (Admin / Manager)
productRouter.post(
  '/',
  authenticate,
  authorize('products', 'write'),
  validate({ body: createProductSchema }),
  productController.create
);

productRouter.put(
  '/:id',
  authenticate,
  authorize('products', 'write'),
  validate({ body: updateProductSchema }),
  productController.update
);

productRouter.delete(
  '/:id',
  authenticate,
  authorize('products', 'write'),
  productController.delete
);

// Product Image upload
productRouter.post(
  '/upload-image',
  authenticate,
  authorize('products', 'write'),
  uploadMiddleware.single('image'),
  productController.uploadImage
);
