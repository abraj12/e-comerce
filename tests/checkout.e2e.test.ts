import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/core/database/prisma.js';

describe('End-to-End Customer Checkout Journey', () => {
  let customerToken: string;
  let testVariantId: string;
  let createdOrderId: string;
  let createdOrderNumber: string;

  before(async () => {
    // 1. Authenticate or Register Customer
    const email = `e2e_cust_${Date.now()}@algions-e2e.local`;
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Aarav Patel',
        email,
        password: 'Password@12345',
        phone: '+919876543299'
      });

    customerToken = regRes.body.data.accessToken;

    // 2. Locate an in-stock product variant
    const product = await prisma.product.findFirst({
      where: { slug: 'organic-royal-basmati-rice' },
      include: { variants: { include: { inventory: true } } }
    });

    testVariantId = product!.variants[0].id;
  });

  it('Step 1: Catalogue Search - Customer browses products and retrieves available stock', async () => {
    const res = await request(app)
      .get('/api/products')
      .query({ search: 'Basmati' });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.items.length > 0);
    assert.ok(res.body.items[0].availableStock > 0);
  });

  it('Step 2: Cart Management - Customer adds 2 units of variant to shopping cart', async () => {
    const res = await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        variantId: testVariantId,
        quantity: 2
      });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.itemCount, 2);
    assert.ok(res.body.data.subtotal > 0);
  });

  it('Step 3: Promotions - Customer applies valid coupon code SAVE10', async () => {
    const res = await request(app)
      .post('/api/cart/coupon')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ couponCode: 'SAVE10' });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.data.discountAmount > 0);
    assert.strictEqual(res.body.data.couponCode, 'SAVE10');
  });

  it('Step 4: Atomic Checkout - Customer places local delivery order with Cash on Delivery', async () => {
    const res = await request(app)
      .post('/api/orders/checkout')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        deliveryType: 'LOCAL_DELIVERY',
        paymentMethod: 'CASH_ON_DELIVERY',
        customerEmail: 'aarav@example.com',
        customerPhone: '+919876543299',
        shippingAddress: {
          recipientName: 'Aarav Patel',
          phone: '+919876543299',
          streetAddress: '42 MG Road, Brigade Junction',
          city: 'Bengaluru',
          state: 'Karnataka',
          pinCode: '560001'
        },
        notes: 'Please call before delivery'
      });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.data.orderNumber);
    assert.strictEqual(res.body.data.status, 'PROCESSING'); // COD starts in PROCESSING
    assert.ok(res.body.data.totalAmount > 0);

    createdOrderId = res.body.data.id;
    createdOrderNumber = res.body.data.orderNumber;

    // Cart must be cleared after checkout
    const cartRes = await request(app)
      .get('/api/cart')
      .set('Authorization', `Bearer ${customerToken}`);

    assert.strictEqual(cartRes.body.data.itemCount, 0);
    assert.strictEqual(cartRes.body.data.subtotal, 0);
  });

  it('Step 5: Order Tracking - Order is queryable by Order Number', async () => {
    const res = await request(app)
      .get(`/api/orders/${createdOrderNumber}`)
      .set('Authorization', `Bearer ${customerToken}`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.orderNumber, createdOrderNumber);
    assert.ok(res.body.data.items.length > 0);
  });

  it('Step 6: Invoice & Receipt Generation - Tax invoice is generated and printable', async () => {
    const jsonRes = await request(app)
      .get(`/api/invoices/${createdOrderId}`)
      .set('Authorization', `Bearer ${customerToken}`);

    assert.strictEqual(jsonRes.status, 200);
    assert.strictEqual(jsonRes.body.success, true);
    assert.ok(jsonRes.body.data.invoiceNumber);

    // Render HTML invoice
    const htmlRes = await request(app)
      .get(`/api/invoices/${createdOrderId}/render`)
      .set('Authorization', `Bearer ${customerToken}`);

    assert.strictEqual(htmlRes.status, 200);
    assert.ok(htmlRes.text.includes('TAX INVOICE'));
    assert.ok(htmlRes.text.includes(createdOrderNumber));
    assert.ok(htmlRes.text.includes('Aarav Patel'));
  });
});
