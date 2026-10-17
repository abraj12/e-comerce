import crypto from 'crypto';
import { env } from '../../core/config/env.js';
import { logger } from '../../core/logging/logger.js';

export interface PaymentIntentResult {
  clientSecret: string;
  paymentId: string;
  amount: number;
  currency: string;
}

export class PaymentAdapter {
  private webhookSecret: string;

  constructor() {
    this.webhookSecret = env.STRIPE_WEBHOOK_SECRET;
  }

  async createPaymentIntent(orderId: string, amount: number, currency = 'INR'): Promise<PaymentIntentResult> {
    // Generate secure payment reference
    const paymentId = `pi_${crypto.randomBytes(12).toString('hex')}`;
    const clientSecret = `${paymentId}_secret_${crypto.randomBytes(16).toString('hex')}`;

    logger.info(`[PAYMENT] Created Payment Intent for Order ${orderId}: ${paymentId} (Amount: ${amount} ${currency})`);

    return {
      paymentId,
      clientSecret,
      amount,
      currency
    };
  }

  generateWebhookSignature(payload: string, timestamp: number): string {
    const signedPayload = `${timestamp}.${payload}`;
    const signature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(signedPayload)
      .digest('hex');

    return `t=${timestamp},v1=${signature}`;
  }

  verifyWebhookSignature(payload: string, signatureHeader: string, toleranceSeconds = 300): boolean {
    try {
      const parts = signatureHeader.split(',');
      const timestampPart = parts.find((p) => p.startsWith('t='));
      const signaturePart = parts.find((p) => p.startsWith('v1='));

      if (!timestampPart || !signaturePart) {
        logger.warn('Webhook signature missing timestamp or v1 signature component');
        return false;
      }

      const timestamp = parseInt(timestampPart.substring(2), 10);
      const providedSignature = signaturePart.substring(3);

      // Replay attack prevention: verify timestamp is within tolerance window
      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - timestamp) > toleranceSeconds) {
        logger.warn(`Webhook rejected: timestamp drift exceeds ${toleranceSeconds}s window`);
        return false;
      }

      const signedPayload = `${timestamp}.${payload}`;
      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(signedPayload)
        .digest('hex');

      // Constant-time comparison to prevent timing attacks
      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'hex'),
        Buffer.from(providedSignature, 'hex')
      );
    } catch (error) {
      logger.error('Error verifying webhook signature', error as Error);
      return false;
    }
  }
}

export const paymentAdapter = new PaymentAdapter();
