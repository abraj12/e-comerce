import Razorpay from 'razorpay';
import crypto from 'crypto';
import { env } from '../../core/config/env.js';
import { logger } from '../../core/logging/logger.js';

export interface RazorpayOrderResult {
  id: string;
  amount: number; // in paise
  currency: string;
  receipt?: string;
  status: string;
}

export interface RazorpayPaymentDetails {
  id: string;
  order_id: string;
  status: string;
  amount: number; // in paise
  currency: string;
  method?: string;
  email?: string;
  contact?: string;
  created_at?: number;
}

export class RazorpayAdapter {
  private client: any = null;
  private keyId: string;
  private keySecret: string;
  private webhookSecret: string;

  constructor(options?: { keyId?: string; keySecret?: string; webhookSecret?: string }) {
    this.keyId = options?.keyId || env.RAZORPAY_KEY_ID;
    this.keySecret = options?.keySecret || env.RAZORPAY_KEY_SECRET;
    this.webhookSecret = options?.webhookSecret || env.RAZORPAY_WEBHOOK_SECRET;
  }

  getClient(): any {
    if (!this.client) {
      if (!this.keyId || !this.keySecret) {
        throw new Error('Razorpay credentials (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET) are not configured');
      }
      this.client = new Razorpay({
        key_id: this.keyId,
        key_secret: this.keySecret
      });
    }
    return this.client;
  }

  setClient(customClient: any) {
    this.client = customClient;
  }

  /**
   * Converts currency amount (INR) to smallest unit (paise) with strict validation and rounding.
   */
  static toPaise(amountInRupees: number): number {
    if (typeof amountInRupees !== 'number' || isNaN(amountInRupees) || amountInRupees <= 0) {
      throw new Error(`Invalid payment amount: ${amountInRupees}`);
    }
    return Math.round(Number((amountInRupees * 100).toFixed(2)));
  }

  /**
   * Converts paise to rupees
   */
  static toRupees(amountInPaise: number): number {
    return Number((amountInPaise / 100).toFixed(2));
  }

  /**
   * Creates a server-side order on Razorpay using trusted database order details.
   */
  async createOrder(params: {
    orderId: string;
    orderNumber: string;
    amountInRupees: number;
    currency?: string;
    notes?: Record<string, string>;
  }): Promise<RazorpayOrderResult> {
    const { orderId, orderNumber, amountInRupees, currency = 'INR', notes = {} } = params;
    const amountInPaise = RazorpayAdapter.toPaise(amountInRupees);

    try {
      const razorpay = this.getClient();
      const receipt = orderNumber.length > 40 ? orderNumber.substring(0, 40) : orderNumber;

      const orderOptions = {
        amount: amountInPaise,
        currency: currency.toUpperCase(),
        receipt,
        notes: {
          orderId,
          orderNumber,
          ...notes
        }
      };

      const response = await razorpay.orders.create(orderOptions);

      logger.info(`[RAZORPAY] Created Razorpay order ${response.id} for internal order ${orderId} (${amountInRupees} ${currency})`);

      return {
        id: response.id,
        amount: Number(response.amount),
        currency: response.currency,
        receipt: response.receipt,
        status: response.status
      };
    } catch (error: any) {
      logger.error(`[RAZORPAY] Failed to create order for ${orderId}: ${error.message || error}`);
      throw new Error(`Payment gateway order creation failed: ${error.message || 'Unknown provider error'}`);
    }
  }

  /**
   * Verifies the Razorpay Checkout signature using HMAC-SHA256 and constant-time comparison.
   * Format: HMAC-SHA256(order_id + "|" + payment_id, secret)
   */
  verifyCheckoutSignature(params: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }): boolean {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = params;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      logger.warn('[RAZORPAY] Missing checkout signature verification parameters');
      return false;
    }

    try {
      const payload = `${razorpayOrderId}|${razorpayPaymentId}`;
      const expectedSignature = crypto
        .createHmac('sha256', this.keySecret)
        .update(payload)
        .digest('hex');

      const expectedBuf = Buffer.from(expectedSignature, 'utf8');
      const signatureBuf = Buffer.from(razorpaySignature, 'utf8');

      if (expectedBuf.length !== signatureBuf.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuf, signatureBuf);
    } catch (error) {
      logger.error('[RAZORPAY] Error verifying checkout signature', error as Error);
      return false;
    }
  }

  /**
   * Helper to generate a valid checkout signature (useful for test suites).
   */
  generateCheckoutSignature(razorpayOrderId: string, razorpayPaymentId: string): string {
    const payload = `${razorpayOrderId}|${razorpayPaymentId}`;
    return crypto
      .createHmac('sha256', this.keySecret)
      .update(payload)
      .digest('hex');
  }

  /**
   * Verifies the Razorpay Webhook signature using exact raw body and X-Razorpay-Signature header.
   */
  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    if (!rawBody || !signature) {
      logger.warn('[RAZORPAY] Webhook verification failed: empty payload or signature header');
      return false;
    }

    try {
      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(rawBody)
        .digest('hex');

      const expectedBuf = Buffer.from(expectedSignature, 'utf8');
      const signatureBuf = Buffer.from(signature, 'utf8');

      if (expectedBuf.length !== signatureBuf.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuf, signatureBuf);
    } catch (error) {
      logger.error('[RAZORPAY] Error verifying webhook signature', error as Error);
      return false;
    }
  }

  /**
   * Helper to generate a valid webhook signature (useful for test suites).
   */
  generateWebhookSignature(rawBody: string): string {
    return crypto
      .createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex');
  }

  /**
   * Fetches the authoritative payment status and details from Razorpay API.
   * Critical security requirement: never trust browser-reported success without server verification.
   */
  async fetchPayment(paymentId: string): Promise<RazorpayPaymentDetails> {
    if (!paymentId) {
      throw new Error('Payment ID is required to fetch payment from Razorpay');
    }

    try {
      const razorpay = this.getClient();
      const payment: any = await razorpay.payments.fetch(paymentId);

      return {
        id: payment.id,
        order_id: payment.order_id,
        status: payment.status,
        amount: Number(payment.amount),
        currency: payment.currency,
        method: payment.method,
        email: payment.email,
        contact: payment.contact,
        created_at: payment.created_at
      };
    } catch (error: any) {
      logger.error(`[RAZORPAY] Failed to fetch payment ${paymentId}: ${error.message || error}`);
      throw new Error(`Failed to verify payment with payment gateway: ${error.message || 'Provider communication error'}`);
    }
  }
}

export const razorpayAdapter = new RazorpayAdapter();
