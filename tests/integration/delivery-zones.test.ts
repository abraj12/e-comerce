import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../../src/app.js';

describe('Local Delivery Service Areas & PIN Code Validation Tests', () => {
  it('PIN Verification: Returns serviceable = true for Central Sector PIN code', async () => {
    const res = await request(app)
      .get('/api/delivery/check')
      .query({ pinCode: '560001', orderSubtotal: 200 });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.serviceable, true);
    assert.strictEqual(res.body.data.zoneName, 'Central City Sector');
    assert.strictEqual(res.body.data.deliveryFee, 30);
  });

  it('Free Delivery Threshold: Automatically waives delivery fee when order exceeds zone threshold', async () => {
    // Central Sector threshold is 350
    const res = await request(app)
      .get('/api/delivery/check')
      .query({ pinCode: '560001', orderSubtotal: 450 });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.serviceable, true);
    assert.strictEqual(res.body.data.isFreeDelivery, true);
    assert.strictEqual(res.body.data.deliveryFee, 0);
  });

  it('Unserviced PIN: Accurately identifies unserviced PIN codes', async () => {
    const res = await request(app)
      .get('/api/delivery/check')
      .query({ pinCode: '999999', orderSubtotal: 100 });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.serviceable, false);
    assert.ok(res.body.data.message.includes('not available'));
  });
});
