import { Router } from 'express';
import { paymentController } from './payment.controller.js';
import { optionalAuthenticate } from '../../core/authentication/middleware.js';

export const paymentRouter = Router();

// Create payment intent
paymentRouter.post('/create-intent', optionalAuthenticate, paymentController.createIntent);

// Secure Signed Webhook Endpoint
paymentRouter.post('/webhook', paymentController.handleWebhook);

// Mock payment trigger for development & automated tests
paymentRouter.post('/mock-pay', optionalAuthenticate, paymentController.mockPay);
