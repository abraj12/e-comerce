import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/core/database/prisma.js';
import { paymentAdapter } from '../../src/integrations/payment/stripeAdapter.js';
import { OrderStatus, PaymentStatus } from '@prisma/client';

describe('Payment & Webhook Signature Verification Tests', () => {
  let orderId: string;

  before(async () => {
    const order = await prisma.order.create({
      data: {
        orderNumber: `ORD-TEST-PAY-${Date.now()}`,
        customerEmail: 'paytest@example.com',
        customerPhone: '+919876543210',
        subtotal: 500,
        taxAmount: 25,
        totalAmount: 525,
        status: OrderStatus.PENDING,
        paymentStatus: PaymentStatus.PENDING,
        paymentMethod: 'ONLINE_STRIPE'
      }
    });

    orderId = order.id;
  });

  it('Payment Intent: Generates clientSecret and paymentId for checkout', async () => {
    const res = await request(app)
      .post('/api/payments/create-intent')
      .send({ orderId });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.data.paymentId);
    assert.ok(res.body.data.clientSecret);
  });

  it('Webhook Verification: Valid HMAC-SHA256 signed payload transitions order to PAID', async () => {
    const paymentId = `pi_test_${Date.now()}`;

    // Create payment transaction
    await prisma.paymentTransaction.create({
      data: {
        orderId,
        provider: 'STRIPE',
        transactionReference: paymentId,
        amount: 525,
        currency: 'INR',
        status: PaymentStatus.PENDING
      }
    });

    const payloadObj = {
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: paymentId,
          amount: 52500,
          currency: 'inr',
          metadata: { orderId }
        }
      }
    };

    const rawPayload = JSON.stringify(payloadObj);
    const now = Math.floor(Date.now() / 1000);
    const validSignature = paymentAdapter.generateWebhookSignature(rawPayload, now);

    const res = await request(app)
      .post('/api/payments/webhook')
      .set('stripe-signature', validSignature)
      .set('Content-Type', 'application/json')
      .send(rawPayload);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.handled, true);

    // Verify order was transitioned to PAID
    const updatedOrder = await prisma.order.findUnique({ where: { id: orderId } });
    assert.strictEqual(updatedOrder?.status, OrderStatus.PAID);
    assert.strictEqual(updatedOrder?.paymentStatus, PaymentStatus.COMPLETED);
  });

  it('Security: Rejects webhook with forged or invalid signature (400 Bad Request)', async () => {
    const forgedPayload = JSON.stringify({ type: 'payment_intent.succeeded' });
    const forgedSignature = 't=1234567890,v1=bad_fake_hash_12345';

    const res = await request(app)
      .post('/api/payments/webhook')
      .set('stripe-signature', forgedSignature)
      .set('Content-Type', 'application/json')
      .send(forgedPayload);

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.error.includes('Invalid webhook signature'));
  });

  it('Replay Attack Prevention: Rejects webhook with stale timestamp drift beyond tolerance', async () => {
    const payload = JSON.stringify({ type: 'payment_intent.succeeded' });
    const staleTimestamp = Math.floor(Date.now() / 1000) - 1000;
    const staleSignature = paymentAdapter.generateWebhookSignature(payload, staleTimestamp);

    const res = await request(app)
      .post('/api/payments/webhook')
      .set('stripe-signature', staleSignature)
      .set('Content-Type', 'application/json')
      .send(payload);

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.error.includes('Invalid webhook signature'));
  });
});
