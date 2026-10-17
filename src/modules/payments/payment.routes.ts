import { Router, Request, Response } from 'express';
import { paymentController } from './payment.controller.js';
import { optionalAuthenticate, authenticate } from '../../core/authentication/middleware.js';
import { paymentRateLimiter } from '../../core/authentication/rateLimiter.js';
import { env } from '../../core/config/env.js';

export const paymentRouter = Router();

// Create Razorpay Order on Backend
paymentRouter.post('/create-order', paymentRateLimiter, optionalAuthenticate, paymentController.createOrder);

// Backward-compatible alias for existing frontend/clients
paymentRouter.post('/create-intent', paymentRateLimiter, optionalAuthenticate, paymentController.createIntent);

// Verify Razorpay Checkout Signature & Server-side Payment Verification
paymentRouter.post('/verify', paymentRateLimiter, optionalAuthenticate, paymentController.verifyPayment);

// Secure Signed Razorpay Webhook Endpoint
paymentRouter.post('/webhook', paymentController.handleWebhook);

// Mock payment trigger: Strictly disabled outside test environment; requires authentication when enabled in test
paymentRouter.post(
  '/mock-pay',
  (req: Request, res: Response, next) => {
    if (env.NODE_ENV !== 'test' || !env.ENABLE_MOCK_PAYMENTS) {
      res.status(403).json({
        success: false,
        error: 'Forbidden: Mock payment simulation is strictly disabled outside isolated test environment'
      });
      return;
    }
    next();
  },
  authenticate,
  paymentController.mockPay
);
