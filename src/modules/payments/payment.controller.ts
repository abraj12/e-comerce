import { Request, Response } from 'express';
import { paymentService } from './payment.service.js';

export class PaymentController {
  async createIntent(req: Request, res: Response): Promise<void> {
    try {
      const result = await paymentService.initiateOnlinePayment(req.body.orderId);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(400).json({ success: false, error: (error as Error).message });
    }
  }

  async handleWebhook(req: Request, res: Response): Promise<void> {
    try {
      const signature = req.headers['stripe-signature'] as string;
      if (!signature) {
        res.status(400).json({ success: false, error: 'Missing stripe-signature header' });
        return;
      }

      // Payload is raw string or stringified body
      const rawPayload = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
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
      res.status(400).json({ success: false, error: (error as Error).message });
    }
  }
}

export const paymentController = new PaymentController();
