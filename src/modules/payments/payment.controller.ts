import { Request, Response } from 'express';
import { paymentService } from './payment.service.js';

export class PaymentController {
  async createOrder(req: Request, res: Response): Promise<void> {
    try {
      const orderId = req.body.orderId;
      if (!orderId) {
        res.status(400).json({ success: false, error: 'orderId is required' });
        return;
      }
      const result = await paymentService.initiateOnlinePayment(orderId, req.user);
      res.json({ success: true, data: result });
    } catch (error) {
      const msg = (error as Error).message;
      const status = msg.includes('Forbidden') ? 403 : msg.includes('Authentication') ? 401 : 400;
      res.status(status).json({ success: false, error: msg });
    }
  }

  // Alias for backward compatibility
  async createIntent(req: Request, res: Response): Promise<void> {
    return this.createOrder(req, res);
  }

  async verifyPayment(req: Request, res: Response): Promise<void> {
    try {
      const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
      const result = await paymentService.verifyPayment({
        orderId,
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
        requestingUser: req.user
      });
      res.json({ success: true, data: result });
    } catch (error) {
      const msg = (error as Error).message;
      const status = msg.includes('Forbidden') ? 403 : msg.includes('Authentication') ? 401 : 400;
      res.status(status).json({ success: false, error: msg });
    }
  }

  async handleWebhook(req: Request, res: Response): Promise<void> {
    try {
      const signature = (req.headers['x-razorpay-signature'] || req.headers['stripe-signature']) as string;
      if (!signature) {
        res.status(400).json({ success: false, error: 'Missing x-razorpay-signature header' });
        return;
      }

      // Exact raw request body
      const rawPayload = (req as any).rawBody || (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
      const result = await paymentService.handlePaymentWebhook(rawPayload, signature);
      res.json({ success: true, ...result });
    } catch (error) {
      res.status(400).json({ success: false, error: (error as Error).message });
    }
  }

  async mockPay(req: Request, res: Response): Promise<void> {
    try {
      const result = await paymentService.simulateMockPaymentSuccess(req.body.orderId, req.user?.userId);
      res.json({ success: true, data: result });
    } catch (error) {
      const msg = (error as Error).message;
      const status = msg.includes('Forbidden') ? 403 : msg.includes('Unauthorized') ? 401 : 400;
      res.status(status).json({ success: false, error: msg });
    }
  }
}

export const paymentController = new PaymentController();
