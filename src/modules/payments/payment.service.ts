import { OrderStatus, PaymentStatus } from '@prisma/client';
import { prisma } from '../../core/database/prisma.js';
import { paymentAdapter } from '../../integrations/payment/stripeAdapter.js';
import { orderService } from '../orders/order.service.js';
import { recordAuditEvent } from '../../core/logging/audit.js';
import { logger } from '../../core/logging/logger.js';
import { v4 as uuidv4 } from 'uuid';

export class PaymentService {
  async initiateOnlinePayment(orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId }
    });

    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    if (order.status === OrderStatus.PAID) {
      throw new Error('Order is already paid');
    }

    const intent = await paymentAdapter.createPaymentIntent(order.id, order.totalAmount, 'INR');

    // Create payment transaction record
    await prisma.paymentTransaction.create({
      data: {
        orderId: order.id,
        provider: 'STRIPE',
        transactionReference: intent.paymentId,
        amount: order.totalAmount,
        currency: intent.currency,
        status: PaymentStatus.PENDING,
        idempotencyKey: uuidv4()
      }
    });

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      amount: order.totalAmount,
      currency: intent.currency,
      paymentId: intent.paymentId,
      clientSecret: intent.clientSecret
    };
  }

  async handlePaymentWebhook(rawPayload: string, signatureHeader: string) {
    // 1. Verify HMAC-SHA256 Signature with timestamp replay defense
    const isValid = paymentAdapter.verifyWebhookSignature(rawPayload, signatureHeader);
    if (!isValid) {
      logger.warn('[PAYMENT] Webhook signature verification failed');
      throw new Error('Invalid webhook signature');
    }

    let event: any;
    try {
      event = JSON.parse(rawPayload);
    } catch {
      throw new Error('Invalid JSON payload in webhook');
    }

    logger.info(`[PAYMENT] Received verified webhook event: ${event.type}`);

    // Handle payment intent success
    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data?.object;
      const paymentId = paymentIntent?.id;
      const orderId = paymentIntent?.metadata?.orderId;

      const transaction = await prisma.paymentTransaction.findFirst({
        where: {
          OR: [
            { transactionReference: paymentId },
            { orderId: orderId }
          ]
        }
      });

      if (!transaction) {
        logger.warn(`[PAYMENT] Transaction reference ${paymentId} not found`);
        return { received: true, handled: false };
      }

      // Replay & Idempotency check: If already completed, skip duplicate processing
      if (transaction.status === PaymentStatus.COMPLETED) {
        logger.info(`[PAYMENT] Transaction ${paymentId} was already completed (idempotent skip)`);
        return { received: true, duplicate: true };
      }

      // Update transaction status
      await prisma.paymentTransaction.update({
        where: { id: transaction.id },
        data: {
          status: PaymentStatus.COMPLETED,
          verifiedAt: new Date(),
          webhookPayload: rawPayload
        }
      });

      // Update Order Status to PAID and commit reserved stock
      await orderService.updateOrderStatus(
        transaction.orderId,
        OrderStatus.PAID,
        'Payment verified via webhook',
        'SYSTEM_WEBHOOK'
      );

      await recordAuditEvent({
        action: 'PAYMENT_VERIFIED',
        entityType: 'Order',
        entityId: transaction.orderId,
        details: { provider: 'STRIPE', paymentId, amount: transaction.amount }
      });

      return { received: true, handled: true, orderId: transaction.orderId };
    }

    return { received: true, unhandledEvent: event.type };
  }

  async simulateMockPaymentSuccess(orderId: string, performedByUserId?: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new Error(`Order ${orderId} not found`);

    const ref = `mock_pay_${Date.now()}`;
    await prisma.paymentTransaction.create({
      data: {
        orderId: order.id,
        provider: 'MOCK',
        transactionReference: ref,
        amount: order.totalAmount,
        currency: 'INR',
        status: PaymentStatus.COMPLETED,
        verifiedAt: new Date()
      }
    });

    await orderService.updateOrderStatus(order.id, OrderStatus.PAID, 'Mock payment completed', performedByUserId);
    return { success: true, orderId: order.id, transactionReference: ref };
  }
}

export const paymentService = new PaymentService();
