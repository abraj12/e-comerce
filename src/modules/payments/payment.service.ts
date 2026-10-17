import { OrderStatus, PaymentStatus } from '@prisma/client';
import { prisma } from '../../core/database/prisma.js';
import { razorpayAdapter, RazorpayAdapter } from '../../integrations/payment/razorpayAdapter.js';
import { orderService } from '../orders/order.service.js';
import { recordAuditEvent } from '../../core/logging/audit.js';
import { logger } from '../../core/logging/logger.js';
import { env } from '../../core/config/env.js';
import { v4 as uuidv4 } from 'uuid';

export class PaymentService {
  /**
   * Initiate online payment by creating a server-side Razorpay order
   * using trusted database order amount and currency.
   */
  async initiateOnlinePayment(orderId: string, requestingUser?: { userId: string; role: string }) {
    if (!orderId) {
      throw new Error('Order ID is required');
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId }
    });

    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    // Authorization check: Customer can only pay for their own order
    if (order.customerId && requestingUser) {
      if (requestingUser.role === 'CUSTOMER' && order.customerId !== requestingUser.userId) {
        throw new Error('Forbidden: You are not authorized to initiate payment for this order');
      }
    } else if (order.customerId && !requestingUser) {
      throw new Error('Authentication required: You must be logged in to initiate payment for this order');
    }

    if (order.status === OrderStatus.PAID) {
      throw new Error('Order is already paid');
    }

    if (order.status === OrderStatus.CANCELLED) {
      throw new Error('Cannot initiate payment for a cancelled order');
    }

    // Create server-side order on Razorpay using trusted order total from database
    const rzpOrder = await razorpayAdapter.createOrder({
      orderId: order.id,
      orderNumber: order.orderNumber,
      amountInRupees: order.totalAmount,
      currency: 'INR'
    });

    // Record or update payment transaction record
    await prisma.paymentTransaction.create({
      data: {
        orderId: order.id,
        provider: 'RAZORPAY',
        transactionReference: rzpOrder.id,
        amount: order.totalAmount,
        currency: 'INR',
        status: PaymentStatus.PENDING,
        idempotencyKey: uuidv4()
      }
    });

    // Return only public launch parameters required by Razorpay Checkout
    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      amount: rzpOrder.amount, // in paise
      amountInRupees: order.totalAmount,
      currency: rzpOrder.currency,
      razorpayOrderId: rzpOrder.id,
      keyId: env.RAZORPAY_KEY_ID
    };
  }

  /**
   * Verify checkout signature and verify payment status directly with Razorpay API.
   * Treats payment as captured only after server-side verification.
   */
  async verifyPayment(params: {
    orderId: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
    requestingUser?: { userId: string; role: string };
  }) {
    const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature, requestingUser } = params;

    if (!orderId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      throw new Error('Missing required payment verification parameters');
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId }
    });

    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    if (order.customerId && requestingUser) {
      if (requestingUser.role === 'CUSTOMER' && order.customerId !== requestingUser.userId) {
        throw new Error('Forbidden: You are not authorized to verify payment for this order');
      }
    }

    // Locate the payment transaction associated with this order and Razorpay order ID
    const transaction = await prisma.paymentTransaction.findFirst({
      where: {
        orderId: order.id,
        transactionReference: razorpayOrderId
      }
    });

    if (!transaction) {
      throw new Error(`Payment transaction not found for Razorpay order ${razorpayOrderId}`);
    }

    // Idempotency: If already completed and order is PAID, return success without duplicate work
    if (transaction.status === PaymentStatus.COMPLETED && order.status === OrderStatus.PAID) {
      logger.info(`[PAYMENT] Payment for order ${order.id} was already completed (idempotent skip)`);
      return { success: true, orderId: order.id, alreadyVerified: true };
    }

    // 1. Verify Razorpay Checkout HMAC signature
    const isSignatureValid = razorpayAdapter.verifyCheckoutSignature({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature
    });

    if (!isSignatureValid) {
      logger.warn(`[PAYMENT] Checkout signature verification failed for order ${orderId}`);
      throw new Error('Invalid Razorpay payment signature');
    }

    // 2. Authoritative Server-side Verification: Fetch payment details directly from Razorpay API
    const payment = await razorpayAdapter.fetchPayment(razorpayPaymentId);

    // Verify payment belongs to the expected Razorpay order
    if (payment.order_id !== razorpayOrderId) {
      logger.error(`[PAYMENT] Payment ${razorpayPaymentId} order_id mismatch. Expected ${razorpayOrderId}, got ${payment.order_id}`);
      throw new Error('Payment does not belong to the specified order');
    }

    // Verify payment status is captured
    if (payment.status !== 'captured') {
      logger.warn(`[PAYMENT] Payment ${razorpayPaymentId} status is '${payment.status}', not captured`);
      throw new Error(`Payment is not in captured status (current status: ${payment.status})`);
    }

    // Verify payment amount matches trusted database order amount (in paise)
    const expectedPaise = RazorpayAdapter.toPaise(order.totalAmount);
    if (payment.amount !== expectedPaise) {
      logger.error(`[PAYMENT] Amount mismatch for order ${orderId}. Expected ${expectedPaise} paise, got ${payment.amount} paise`);
      throw new Error('Payment amount does not match order amount');
    }

    if (payment.currency.toUpperCase() !== 'INR') {
      logger.error(`[PAYMENT] Currency mismatch for order ${orderId}. Expected INR, got ${payment.currency}`);
      throw new Error('Payment currency does not match order currency');
    }

    // 3. Update payment transaction to COMPLETED
    await prisma.paymentTransaction.update({
      where: { id: transaction.id },
      data: {
        status: PaymentStatus.COMPLETED,
        paymentId: razorpayPaymentId,
        verifiedAt: new Date()
      }
    });

    // 4. Update internal order status to PAID and commit inventory atomically
    await orderService.updateOrderStatus(
      order.id,
      OrderStatus.PAID,
      'Payment verified via Razorpay Checkout',
      requestingUser?.userId || 'SYSTEM_RAZORPAY'
    );

    await recordAuditEvent({
      userId: requestingUser?.userId,
      action: 'PAYMENT_VERIFIED',
      entityType: 'Order',
      entityId: order.id,
      details: {
        provider: 'RAZORPAY',
        razorpayOrderId,
        razorpayPaymentId,
        amount: order.totalAmount
      }
    });

    return {
      success: true,
      orderId: order.id,
      paymentId: razorpayPaymentId,
      status: 'PAID'
    };
  }

  /**
   * Handle Razorpay webhooks with HMAC-SHA256 signature verification and idempotent processing.
   */
  async handlePaymentWebhook(rawPayload: string, signatureHeader: string) {
    // 1. Verify HMAC-SHA256 Signature using exact raw body and X-Razorpay-Signature header
    const isValid = razorpayAdapter.verifyWebhookSignature(rawPayload, signatureHeader);
    if (!isValid) {
      logger.warn('[PAYMENT] Razorpay webhook signature verification failed');
      throw new Error('Invalid Razorpay webhook signature');
    }

    let event: any;
    try {
      event = JSON.parse(rawPayload);
    } catch {
      throw new Error('Invalid JSON payload in webhook');
    }

    const eventType = event.event;
    logger.info(`[PAYMENT] Received verified Razorpay webhook event: ${eventType}`);

    // Handle payment capture / order paid events
    if (eventType === 'payment.captured' || eventType === 'order.paid') {
      const paymentEntity = event.payload?.payment?.entity;
      const paymentId = paymentEntity?.id;
      const rzpOrderId = paymentEntity?.order_id || event.payload?.order?.entity?.id;

      if (!rzpOrderId) {
        logger.warn('[PAYMENT] Webhook event missing order_id');
        return { received: true, handled: false, reason: 'Missing order_id' };
      }

      const transaction = await prisma.paymentTransaction.findFirst({
        where: {
          OR: [
            { transactionReference: rzpOrderId },
            ...(paymentId ? [{ paymentId }] : [])
          ]
        },
        include: { order: true }
      });

      if (!transaction) {
        logger.warn(`[PAYMENT] Transaction reference ${rzpOrderId} not found in database`);
        return { received: true, handled: false, reason: 'Transaction reference not found' };
      }

      // Idempotency check: If already completed, skip duplicate processing safely
      if (transaction.status === PaymentStatus.COMPLETED && transaction.order.status === OrderStatus.PAID) {
        logger.info(`[PAYMENT] Webhook for transaction ${rzpOrderId} was already completed (idempotent skip)`);
        return { received: true, duplicate: true };
      }

      // Verify payment entity amount matches trusted database order amount
      if (paymentEntity) {
        const expectedPaise = RazorpayAdapter.toPaise(transaction.order.totalAmount);
        if (paymentEntity.amount !== expectedPaise) {
          logger.error(`[PAYMENT] Webhook amount mismatch for order ${transaction.orderId}. Expected ${expectedPaise}, got ${paymentEntity.amount}`);
          throw new Error('Payment amount does not match order amount');
        }
        if (paymentEntity.currency?.toUpperCase() !== 'INR') {
          throw new Error('Payment currency mismatch in webhook payload');
        }
      }

      // Update transaction status
      await prisma.paymentTransaction.update({
        where: { id: transaction.id },
        data: {
          status: PaymentStatus.COMPLETED,
          paymentId: paymentId || transaction.paymentId,
          verifiedAt: new Date(),
          webhookPayload: rawPayload
        }
      });

      // Update Order Status to PAID and commit reserved stock
      await orderService.updateOrderStatus(
        transaction.orderId,
        OrderStatus.PAID,
        'Payment verified via Razorpay webhook',
        'SYSTEM_WEBHOOK'
      );

      await recordAuditEvent({
        action: 'PAYMENT_VERIFIED',
        entityType: 'Order',
        entityId: transaction.orderId,
        details: {
          provider: 'RAZORPAY',
          razorpayOrderId: rzpOrderId,
          paymentId,
          amount: transaction.amount
        }
      });

      return { received: true, handled: true, orderId: transaction.orderId };
    }

    if (eventType === 'payment.failed') {
      const paymentEntity = event.payload?.payment?.entity;
      const paymentId = paymentEntity?.id;
      const rzpOrderId = paymentEntity?.order_id;

      if (rzpOrderId) {
        const transaction = await prisma.paymentTransaction.findFirst({
          where: { transactionReference: rzpOrderId }
        });

        if (transaction && transaction.status !== PaymentStatus.COMPLETED) {
          await prisma.paymentTransaction.update({
            where: { id: transaction.id },
            data: {
              status: PaymentStatus.FAILED,
              paymentId: paymentId || transaction.paymentId,
              webhookPayload: rawPayload
            }
          });

          await recordAuditEvent({
            action: 'PAYMENT_FAILED',
            entityType: 'Order',
            entityId: transaction.orderId,
            details: {
              provider: 'RAZORPAY',
              razorpayOrderId: rzpOrderId,
              paymentId,
              reason: paymentEntity?.error_description
            }
          });
        }
      }

      return { received: true, handled: true, status: 'FAILED' };
    }

    return { received: true, unhandledEvent: eventType };
  }

  /**
   * Mock payment simulation strictly restricted to test environments with explicit env activation.
   * Must never be enabled in production or without authentication.
   */
  async simulateMockPaymentSuccess(orderId: string, performedByUserId?: string) {
    // 1. Strict environment validation: only allowed in NODE_ENV === 'test' with ENABLE_MOCK_PAYMENTS === true
    if (env.NODE_ENV !== 'test' || !env.ENABLE_MOCK_PAYMENTS) {
      logger.warn(`[SECURITY] Mock payment rejected: NODE_ENV=${env.NODE_ENV}, ENABLE_MOCK_PAYMENTS=${env.ENABLE_MOCK_PAYMENTS}`);
      throw new Error('Forbidden: Mock payment simulation is strictly disabled outside isolated test environments');
    }

    // 2. Authentication enforcement: no unauthenticated request can mark an order paid
    if (!performedByUserId) {
      throw new Error('Unauthorized: Authentication required to execute test mock payment');
    }

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

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

    await orderService.updateOrderStatus(order.id, OrderStatus.PAID, 'Mock payment completed in test mode', performedByUserId);
    return { success: true, orderId: order.id, transactionReference: ref };
  }
}

export const paymentService = new PaymentService();
