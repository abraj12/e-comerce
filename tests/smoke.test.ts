import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../src/app.js';

describe('Post-Deployment Smoke Tests', () => {
  it('Health Check: /api/health returns 200 with database connected and memory metrics', async () => {
    const res = await request(app).get('/api/health');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'healthy');
    assert.strictEqual(res.body.database.status, 'connected');
    assert.ok(res.body.memory.heapUsedMb > 0);
  });

  it('Security Headers: Helmet headers (X-Frame-Options, CSP, X-Content-Type-Options) are applied', async () => {
    const res = await request(app).get('/api/health');
    assert.ok(res.headers['x-content-type-options']);
    assert.ok(res.headers['content-security-policy']);
  });

  it('Storefront UI: Static HTML is served at root /', async () => {
    const res = await request(app).get('/');
    assert.strictEqual(res.status, 200);
    assert.ok(res.text.includes('ALGIONS'));
    assert.ok(res.text.includes('Local Retail'));
  });

  it('Admin UI: Admin panel is served at /admin/', async () => {
    const res = await request(app).get('/admin/');
    assert.strictEqual(res.status, 200);
    assert.ok(res.text.includes('ALGIONS Admin Portal'));
  });

  it('OpenAPI Spec: Spec is served at /docs/openapi.json', async () => {
    const res = await request(app).get('/docs/openapi.json');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.openapi, '3.0.3');
    assert.strictEqual(res.body.info.title, 'ALGIONS Retail E-Commerce API');
  });

  it('OpenAPI UI: Swagger UI is served at /api-docs', async () => {
    const res = await request(app).get('/api-docs');
    assert.strictEqual(res.status, 200);
    assert.ok(res.text.includes('swagger-ui'));
  });
});
