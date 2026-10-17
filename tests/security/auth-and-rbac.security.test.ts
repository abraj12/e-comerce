import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../../src/app.js';
import { checkPermission } from '../../src/core/authorization/casbin.js';

describe('Security & RBAC Enforcement Tests (OWASP Verification)', () => {
  let customerToken: string;
  let adminToken: string;

  before(async () => {
    // Authenticate admin
    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@algions.local', password: 'Admin@123456' });
    adminToken = adminRes.body.data.accessToken;

    // Authenticate customer
    const custRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'customer@example.com', password: 'Customer@123456' });
    customerToken = custRes.body.data.accessToken;
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

  it('IDOR Defense: Customer A cannot view another user private order', async () => {
    // Register Customer B
    const uniqueEmail = `custb_${Date.now()}@test.local`;
    const custBRes = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Customer B', email: uniqueEmail, password: 'Password@123' });
    const custBToken = custBRes.body.data.accessToken;

    // Check order lookup with an order id belonging to customer A
    const ordersRes = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${customerToken}`);

    if (ordersRes.body.orders && ordersRes.body.orders.length > 0) {
      const orderId = ordersRes.body.orders[0].id;
      // Customer B tries to view Customer A's order
      const idorAttempt = await request(app)
        .get(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${custBToken}`);

      assert.strictEqual(idorAttempt.status, 403);
      assert.ok(idorAttempt.body.error.includes('Forbidden'));
    }
  });
});
