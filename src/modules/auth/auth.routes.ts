import { Router } from 'express';
import { authController } from './auth.controller.js';
import { validate } from '../../core/validation/validator.js';
import { registerSchema, loginSchema, refreshSchema, createEmployeeSchema } from './auth.schema.js';
import { authenticate } from '../../core/authentication/middleware.js';
import { authorize } from '../../core/authorization/guard.js';
import { authRateLimiter } from '../../core/authentication/rateLimiter.js';

export const authRouter = Router();

// Public routes with brute-force rate limiting
authRouter.post('/register', authRateLimiter, validate({ body: registerSchema }), authController.register);
authRouter.post('/login', authRateLimiter, validate({ body: loginSchema }), authController.login);
authRouter.post('/refresh', validate({ body: refreshSchema }), authController.refresh);
authRouter.post('/logout', authController.logout);

// Protected routes
authRouter.get('/me', authenticate, authController.getMe);

// Shop Administration - Employee management (Admin only)
authRouter.post(
  '/employees',
  authenticate,
  authorize('ADMIN', 'write'),
  validate({ body: createEmployeeSchema }),
  authController.createEmployee
);

authRouter.get(
  '/employees',
  authenticate,
  authorize('ADMIN', 'read'),
  authController.listEmployees
);
