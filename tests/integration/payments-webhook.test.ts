import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/core/database/prisma.js';
import { razorpayAdapter } from '../../src/integrations/payment/razorpayAdapter.js';
import { OrderStatus, PaymentStatus } from '@prisma/client';

describe('Razorpay Payment Gateway & Webhook Security Tests', () => {
  let orderId: string;
  let testRzpOrderId: string;
  const expectedAmountInRupees = 525.0;
  const expectedAmountInPaise = 52500;

  before(async () => {
    // Create an order in PENDING status
    const order = await prisma.order.create({
      data: {
        orderNumber: `ORD-TEST-RZP-${Date.now()}`,
        customerEmail: 'rzptest@algions.local',
        customerPhone: '+919876543210',
        subtotal: 500.0,
        taxAmount: 25.0,
        totalAmount: expectedAmountInRupees,
        status: OrderStatus.PENDING,
        paymentStatus: PaymentStatus.PENDING,
        paymentMethod: 'ONLINE_RAZORPAY'
      }
    });

    orderId = order.id;

    // Configure mock Razorpay SDK client for unit/integration tests
    razorpayAdapter.setClient({
      orders: {
        create: async (opts: any) => ({
          id: `order_rzp_${Date.now()}`,
          amount: opts.amount,
          currency: opts.currency,
          receipt: opts.receipt,
          status: 'created'
        })
      },
      payments: {
        fetch: async (paymentId: string) => {
          if (paymentId === 'pay_network_fail') {
            throw new Error('Connection timeout to Razorpay API gateway');
          }
          if (paymentId === 'pay_uncaptured') {
            return {
              id: paymentId,
              order_id: testRzpOrderId,
              status: 'authorized', // Not captured!
              amount: expectedAmountInPaise,
              currency: 'INR'
            };
          }
          if (paymentId === 'pay_wrong_amount') {
            return {
              id: paymentId,
              order_id: testRzpOrderId,
              status: 'captured',
              amount: 10000, // 100 INR instead of 525 INR!
              currency: 'INR'
            };
          }
          if (paymentId === 'pay_wrong_currency') {
            return {
              id: paymentId,
              order_id: testRzpOrderId,
              status: 'captured',
              amount: expectedAmountInPaise,
              currency: 'USD'
            };
          }
          if (paymentId === 'pay_wrong_order') {
            return {
              id: paymentId,
              order_id: 'order_some_other_order',
              status: 'captured',
              amount: expectedAmountInPaise,
              currency: 'INR'
            };
          }
          return {
            id: paymentId,
            order_id: testRzpOrderId,
            status: 'captured',
            amount: expectedAmountInPaise,
            currency: 'INR'
          };
        }
      }
    });
  });

  it('1. Order Creation: Creates Razorpay order using trusted database amount in paise', async () => {
    const res = await request(app)
      .post('/api/payments/create-order')
      .send({ orderId });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.data.razorpayOrderId);
    assert.strictEqual(res.body.data.amount, expectedAmountInPaise);
    assert.strictEqual(res.body.data.currency, 'INR');
    assert.ok(res.body.data.keyId);
    assert.strictEqual(res.body.data.keySecret, undefined); // Secret must NEVER be returned

    testRzpOrderId = res.body.data.razorpayOrderId;
  });

  it('2. Signature Security: Rejects checkout verification with tampered signature', async () => {
    const forgedSignature = 'forged_fake_signature_abc123';

    const res = await request(app)
      .post('/api/payments/verify')
      .send({
        orderId,
        razorpayOrderId: testRzpOrderId,
        razorpayPaymentId: 'pay_valid_123',
        razorpaySignature: forgedSignature
      });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.error.includes('Invalid Razorpay payment signature'));
  });

  it('3. ID Verification: Rejects payment when payment ID does not match the Razorpay order ID', async () => {
    const paymentId = 'pay_wrong_order';
    const validSignature = razorpayAdapter.generateCheckoutSignature(testRzpOrderId, paymentId);

    const res = await request(app)
      .post('/api/payments/verify')
      .send({
        orderId,
        razorpayOrderId: testRzpOrderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: validSignature
      });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.error.includes('does not belong to the specified order'));
  });

  it('4. Amount Validation: Rejects payment if server-side Razorpay amount does not match DB amount', async () => {
    const paymentId = 'pay_wrong_amount';
    const validSignature = razorpayAdapter.generateCheckoutSignature(testRzpOrderId, paymentId);

    const res = await request(app)
      .post('/api/payments/verify')
      .send({
        orderId,
        razorpayOrderId: testRzpOrderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: validSignature
      });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.error.includes('amount does not match order amount'));
  });

  it('5. Status Verification: Rejects uncaptured/authorized payments from being treated as paid', async () => {
    const paymentId = 'pay_uncaptured';
    const validSignature = razorpayAdapter.generateCheckoutSignature(testRzpOrderId, paymentId);

    const res = await request(app)
      .post('/api/payments/verify')
      .send({
        orderId,
        razorpayOrderId: testRzpOrderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: validSignature
      });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.error.includes('not in captured status'));
  });

  it('6. Provider Failure: Safely handles Razorpay API network failure/timeouts', async () => {
    const paymentId = 'pay_network_fail';
    const validSignature = razorpayAdapter.generateCheckoutSignature(testRzpOrderId, paymentId);

    const res = await request(app)
      .post('/api/payments/verify')
      .send({
        orderId,
        razorpayOrderId: testRzpOrderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: validSignature
      });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.error.includes('Failed to verify payment with payment gateway'));
  });

  it('7. Webhook Security: Rejects webhook with invalid or forged HMAC signature', async () => {
    const rawPayload = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_webhook_test',
            order_id: testRzpOrderId,
            amount: expectedAmountInPaise,
            currency: 'INR'
          }
        }
      }
    });

    const res = await request(app)
      .post('/api/payments/webhook')
      .set('x-razorpay-signature', 'bad_forged_webhook_signature')
      .set('Content-Type', 'application/json')
      .send(rawPayload);

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.error.includes('Invalid Razorpay webhook signature'));
  });

  it('8. Webhook Processing: Valid HMAC signed payment.captured transitions order to PAID', async () => {
    const paymentId = `pay_hook_${Date.now()}`;
    const payloadObj = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: testRzpOrderId,
            amount: expectedAmountInPaise,
            currency: 'INR',
            status: 'captured'
          }
        }
      }
    };

    const rawPayload = JSON.stringify(payloadObj);
    const validSignature = razorpayAdapter.generateWebhookSignature(rawPayload);

    const res = await request(app)
      .post('/api/payments/webhook')
      .set('x-razorpay-signature', validSignature)
      .set('Content-Type', 'application/json')
      .send(rawPayload);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.handled, true);

    // Verify order was transitioned to PAID in database
    const updatedOrder = await prisma.order.findUnique({ where: { id: orderId } });
    assert.strictEqual(updatedOrder?.status, OrderStatus.PAID);
    assert.strictEqual(updatedOrder?.paymentStatus, PaymentStatus.COMPLETED);
  });

  it('9. Webhook Idempotency: Duplicate delivery of same webhook does not commit stock twice', async () => {
    const payloadObj = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: `pay_hook_dup`,
            order_id: testRzpOrderId,
            amount: expectedAmountInPaise,
            currency: 'INR'
          }
        }
      }
    };

    const rawPayload = JSON.stringify(payloadObj);
    const validSignature = razorpayAdapter.generateWebhookSignature(rawPayload);

    const res = await request(app)
      .post('/api/payments/webhook')
      .set('x-razorpay-signature', validSignature)
      .set('Content-Type', 'application/json')
      .send(rawPayload);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.duplicate, true); // Safely identified duplicate
  });

  it('10. Mock Payment Defense: Rejects unauthenticated mock payment attempts', async () => {
    const res = await request(app)
      .post('/api/payments/mock-pay')
      .send({ orderId });

    // Unauthenticated request must be rejected (401 or 403)
    assert.ok(res.status === 401 || res.status === 403);
    assert.strictEqual(res.body.success, false);
  });
});
