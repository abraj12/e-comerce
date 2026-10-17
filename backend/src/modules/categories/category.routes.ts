import { Router } from 'express';
import { categoryController } from './category.controller.js';
import { validate } from '../../core/validation/validator.js';
import { createCategorySchema, updateCategorySchema } from './category.schema.js';
import { authenticate } from '../../core/authentication/middleware.js';
import { authorize } from '../../core/authorization/guard.js';

export const categoryRouter = Router();

// Public routes
categoryRouter.get('/', categoryController.list);
categoryRouter.get('/:slug', categoryController.getBySlug);

// Protected routes (Admin / Manager)
categoryRouter.post(
  '/',
  authenticate,
  authorize('categories', 'write'),
  validate({ body: createCategorySchema }),
  categoryController.create
);

categoryRouter.put(
  '/:id',
  authenticate,
  authorize('categories', 'write'),
  validate({ body: updateCategorySchema }),
  categoryController.update
);

categoryRouter.delete(
  '/:id',
  authenticate,
  authorize('categories', 'write'),
  categoryController.delete
);
