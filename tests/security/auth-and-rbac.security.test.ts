import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../../src/app.js';
import { checkPermission } from '../../src/core/authorization/casbin.js';
import { prisma } from '../../src/core/database/prisma.js';
import { OrderStatus } from '@prisma/client';

describe('Security & RBAC Enforcement Tests (OWASP Verification)', () => {
  let customerToken: string;
  let adminToken: string;
  let customerBToken: string;
  let customerAOrderId: string;
  let guestOrderId: string;
  let guestAccessToken: string;
  let testVariantId: string;
  let customerACartItemId: string;

  before(async () => {
    // Authenticate admin
    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@algions.local', password: 'Admin@123456' });
    adminToken = adminRes.body.data.accessToken;

    // Authenticate customer A
    const custRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'customer@example.com', password: 'Customer@123456' });
    customerToken = custRes.body.data.accessToken;

    // Register Customer B
    const uniqueEmail = `custb_${Date.now()}@test.local`;
    const custBRes = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Customer B', email: uniqueEmail, password: 'Password@123' });
    customerBToken = custBRes.body.data.accessToken;

    // Get a product variant
    const variant = await prisma.productVariant.findFirst({
      include: { product: true }
    });
    testVariantId = variant!.id;

    // Setup cart and item for Customer A
    const cartRes = await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ variantId: testVariantId, quantity: 1 });
    customerACartItemId = cartRes.body.data.items[0].id;

    // Create an order for Customer A
    const orderA = await request(app)
      .post('/api/orders/checkout')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        deliveryType: 'STORE_PICKUP',
        paymentMethod: 'CASH_ON_DELIVERY',
        customerEmail: 'customer@example.com',
        customerPhone: '+919876543210'
      });
    customerAOrderId = orderA.body.data.id;

    // Create a Guest Order
    const guestOrder = await request(app)
      .post('/api/orders/checkout')
      .set('x-session-id', `guest_sess_${Date.now()}`)
      .send({
        deliveryType: 'STORE_PICKUP',
        paymentMethod: 'CASH_ON_DELIVERY',
        customerEmail: 'guest_buyer@example.com',
        customerPhone: '+919876543222'
      });
    // Wait, cart was empty for that new session, let's create a guest cart item first
    const guestSessId = `guest_sess_${Date.now()}`;
    await request(app)
      .post('/api/cart/items')
      .set('x-session-id', guestSessId)
      .send({ variantId: testVariantId, quantity: 1 });

    const guestOrderRes = await request(app)
      .post('/api/orders/checkout')
      .set('x-session-id', guestSessId)
      .send({
        deliveryType: 'STORE_PICKUP',
        paymentMethod: 'CASH_ON_DELIVERY',
        customerEmail: 'guest_buyer@example.com',
        customerPhone: '+919876543222'
      });

    guestOrderId = guestOrderRes.body.data.id;
    guestAccessToken = guestOrderRes.body.data.guestAccessToken;
  });

  it('Deny-by-Default: Protected endpoints must reject unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/reports/dashboard');
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.success, false);
  });

  it('Deny-by-Default: Requests with invalid/tampered token must be rejected with 401', async () => {
    const res = await request(app)
      .get('/api/reports/dashboard')
      .set('Authorization', 'Bearer invalid-tampered-token-xyz');
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.success, false);
  });

  it('Privilege Escalation Prevention: Customer role MUST NOT access admin reports (403 Forbidden)', async () => {
    const res = await request(app)
      .get('/api/reports/dashboard')
      .set('Authorization', `Bearer ${customerToken}`);

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.error.includes('Forbidden'));
  });

  it('Privilege Escalation Prevention: Customer role MUST NOT create catalogue products (403 Forbidden)', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        name: 'Unauthorized Product',
        sku: 'HACK-01',
        basePrice: 10
      });

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.success, false);
  });

  it('Privilege Escalation Prevention: Customer role MUST NOT adjust inventory levels (403 Forbidden)', async () => {
    const res = await request(app)
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        variantId: '00000000-0000-0000-0000-000000000000',
        quantityChange: 100,
        reason: 'RESTOCK'
      });

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.success, false);
  });

  it('Casbin Engine: Admin role must have wildcard permissions (* on *)', async () => {
    const canDoAnything = await checkPermission('ADMIN', 'products', 'delete');
    assert.strictEqual(canDoAnything, true);
  });

  it('Casbin Engine: Staff role must NOT have permission to delete products or view audit logs', async () => {
    const canDelete = await checkPermission('STAFF', 'products', 'delete');
    assert.strictEqual(canDelete, false);

    const canViewAudit = await checkPermission('STAFF', 'ADMIN', 'read');
    assert.strictEqual(canViewAudit, false);
  });

  it('Input Validation: Rejects registration with invalid email or short password (400 Bad Request)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Bad Input User',
        email: 'not-an-email',
        password: '123'
      });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error, 'Validation Error');
  });

  it('IDOR Defense: Customer B cannot view Customer A private order (403 Forbidden)', async () => {
    const idorAttempt = await request(app)
      .get(`/api/orders/${customerAOrderId}`)
      .set('Authorization', `Bearer ${customerBToken}`);

    assert.strictEqual(idorAttempt.status, 403);
    assert.ok(idorAttempt.body.error.includes('Forbidden'));
  });

  it('Order Protection: Anonymous user CANNOT view customer private order (401 Unauthorized)', async () => {
    const anonAttempt = await request(app)
      .get(`/api/orders/${customerAOrderId}`);

    assert.strictEqual(anonAttempt.status, 401);
    assert.strictEqual(anonAttempt.body.success, false);
  });

  it('Invoice Protection: Anonymous user CANNOT view customer private invoice (401 Unauthorized)', async () => {
    const anonInvoice = await request(app)
      .get(`/api/invoices/${customerAOrderId}`);

    assert.strictEqual(anonInvoice.status, 401);
    assert.strictEqual(anonInvoice.body.success, false);

    const anonHtml = await request(app)
      .get(`/api/invoices/${customerAOrderId}/render`);

    assert.strictEqual(anonHtml.status, 401);
  });

  it('Invoice Protection: Customer B CANNOT view Customer A invoice (403 Forbidden)', async () => {
    const res = await request(app)
      .get(`/api/invoices/${customerAOrderId}`)
      .set('Authorization', `Bearer ${customerBToken}`);

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.error.includes('Forbidden'));
  });

  it('Guest Checkout Access: Guest CAN view invoice with valid guest access token', async () => {
    const res = await request(app)
      .get(`/api/invoices/${guestOrderId}`)
      .query({ token: guestAccessToken });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.data.invoiceNumber);

    const htmlRes = await request(app)
      .get(`/api/invoices/${guestOrderId}/render`)
      .query({ token: guestAccessToken });

    assert.strictEqual(htmlRes.status, 200);
    assert.ok(htmlRes.text.includes('TAX INVOICE'));
  });

  it('Guest Checkout Protection: Anonymous request with invalid token is rejected (401 Unauthorized)', async () => {
    const res = await request(app)
      .get(`/api/invoices/${guestOrderId}`)
      .query({ token: 'wrong_fake_token_123' });

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.success, false);
  });

  it('Cart Item Ownership: Customer B CANNOT update Customer A cart item quantity (404 Not Found)', async () => {
    const res = await request(app)
      .put(`/api/cart/items/${customerACartItemId}`)
      .set('Authorization', `Bearer ${customerBToken}`)
      .send({ quantity: 5 });

    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.success, false);
  });

  it('Cart Item Ownership: Customer B CANNOT delete Customer A cart item (404 Not Found)', async () => {
    const res = await request(app)
      .delete(`/api/cart/items/${customerACartItemId}`)
      .set('Authorization', `Bearer ${customerBToken}`);

    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.success, false);
  });

  it('Payment Authorization: Customer B CANNOT initiate payment for Customer A order (403 Forbidden)', async () => {
    const res = await request(app)
      .post('/api/payments/create-order')
      .set('Authorization', `Bearer ${customerBToken}`)
      .send({ orderId: customerAOrderId });

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.error.includes('Forbidden'));
  });

  it('Order Status Protection: Customer role CANNOT update order status (403 Forbidden)', async () => {
    const res = await request(app)
      .patch(`/api/orders/${customerAOrderId}/status`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ status: 'DELIVERED' });

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.success, false);
  });

  it('Order State Machine: Rejects invalid order status transition from CANCELLED to PAID (400 Bad Request)', async () => {
    // 1. Transition order to CANCELLED via Admin
    await request(app)
      .patch(`/api/orders/${customerAOrderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'CANCELLED', reason: 'Customer requested cancellation' });

    // 2. Attempt illegal transition from CANCELLED to PAID
    const illegalRes = await request(app)
      .patch(`/api/orders/${customerAOrderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'PAID' });

    assert.strictEqual(illegalRes.status, 400);
    assert.strictEqual(illegalRes.body.success, false);
    assert.ok(illegalRes.body.error.includes('Cannot transition order from CANCELLED to PAID'));
  });

  it('Safe Public Tracking: Public tracking endpoint discloses only non-sensitive fulfillment info', async () => {
    const order = await prisma.order.findUnique({ where: { id: customerAOrderId } });

    const res = await request(app)
      .get(`/api/orders/${order!.orderNumber}/track`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.orderNumber, order!.orderNumber);
    assert.strictEqual(res.body.data.status, OrderStatus.CANCELLED);
    // Sensitive customer PII must NOT be leaked in public tracking
    assert.strictEqual(res.body.data.customerEmail, undefined);
    assert.strictEqual(res.body.data.customerPhone, undefined);
    assert.strictEqual(res.body.data.shippingAddress, undefined);
  });

  it('Settings Protection: Store settings endpoint rejects sensitive keys in input validation', async () => {
    const res = await request(app)
      .post('/api/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        key: 'razorpay_secret_override',
        value: 'hacked_secret_123'
      });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
  });
});
