import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import crypto from 'crypto';
import { app } from '../../src/app.js';
import { prisma } from '../../src/core/database/prisma.js';

describe('Account Recovery & Password Reset Security Tests (OWASP Verification)', () => {
  let testUserEmail: string;
  let testUserPassword = 'InitialPassword@123';
  let testUserId: string;

  before(async () => {
    // Create dedicated test user
    testUserEmail = `recovery_test_${Date.now()}@algions.local`;
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Recovery Test User',
        email: testUserEmail,
        password: testUserPassword
      });
    assert.strictEqual(regRes.status, 201);
    testUserId = regRes.body.data.user.id;
  });

  it('OWASP Anti-Enumeration: forgot-password returns generic response when user exists', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: testUserEmail });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.message.includes('If an account with that email exists'));
    // In test environment, debugToken is provided for test verification
    assert.ok(res.body.debugToken, 'debugToken should be available in test environment');
  });

  it('OWASP Anti-Enumeration: forgot-password returns identical generic response for non-existent email', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nonexistent_account_xyz@nowhere.local' });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.message.includes('If an account with that email exists'));
    // No debugToken for non-existent email
    assert.strictEqual(res.body.debugToken, undefined);
  });

  it('Password Reset Flow: Valid token updates password and allows login with new password', async () => {
    // Request reset token
    const forgotRes = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: testUserEmail });
    const resetToken = forgotRes.body.debugToken;
    assert.ok(resetToken);

    // Reset password
    const newPassword = 'NewSecretPassword@456';
    const resetRes = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: resetToken, password: newPassword });

    assert.strictEqual(resetRes.status, 200);
    assert.strictEqual(resetRes.body.success, true);
    assert.ok(resetRes.body.message.includes('Password has been reset successfully'));

    // Old password should now fail
    const oldLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: testUserEmail, password: testUserPassword });
    assert.strictEqual(oldLoginRes.status, 401);

    // New password should succeed
    const newLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: testUserEmail, password: newPassword });
    assert.strictEqual(newLoginRes.status, 200);
    assert.strictEqual(newLoginRes.body.success, true);

    // Update testUserPassword for subsequent tests
    testUserPassword = newPassword;
  });

  it('Replay Prevention: Single-use reset token cannot be reused', async () => {
    // Request a token
    const forgotRes = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: testUserEmail });
    const resetToken = forgotRes.body.debugToken;
    assert.ok(resetToken);

    // First use: succeeds
    const firstUseRes = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: resetToken, password: 'ReplayPassword@789' });
    assert.strictEqual(firstUseRes.status, 200);

    // Second use (replay attempt): must be rejected
    const replayRes = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: resetToken, password: 'AnotherPassword@000' });
    assert.strictEqual(replayRes.status, 400);
    assert.strictEqual(replayRes.body.success, false);
    assert.ok(replayRes.body.error.includes('Invalid or expired password reset token'));

    testUserPassword = 'ReplayPassword@789';
  });

  it('Token Expiration: Expired reset token is rejected (400 Bad Request)', async () => {
    // Generate token and manually store as expired in DB
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    const pastExpiry = new Date(Date.now() - 60 * 1000); // 1 minute in the past

    await prisma.user.update({
      where: { id: testUserId },
      data: {
        resetToken: hashedToken,
        resetTokenExpiry: pastExpiry
      }
    });

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: rawToken, password: 'ExpiredTokenPassword@123' });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.error.includes('Invalid or expired password reset token'));
  });

  it('Integrity Check: Tampered or invalid reset token is rejected', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'completely-invalid-or-forged-token-abc123', password: 'ValidPassword@123' });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.error.includes('Invalid or expired password reset token'));
  });

  it('Session Revocation: Password reset revokes all prior active sessions for user', async () => {
    // 1. Log in to create a session
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: testUserEmail, password: testUserPassword });
    const priorRefreshToken = loginRes.body.data.refreshToken;
    assert.ok(priorRefreshToken);

    // 2. Request forgot password and reset password
    const forgotRes = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: testUserEmail });
    const resetToken = forgotRes.body.debugToken;

    const resetRes = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: resetToken, password: 'BrandNewPassword@999' });
    assert.strictEqual(resetRes.status, 200);

    // 3. Attempting to refresh tokens with the prior session MUST fail (revoked)
    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: priorRefreshToken });
    assert.strictEqual(refreshRes.status, 401);
    assert.strictEqual(refreshRes.body.success, false);

    testUserPassword = 'BrandNewPassword@999';
  });

  it('Authenticated Password Change: Verifies current password and revokes previous sessions', async () => {
    // Log in with new credentials
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: testUserEmail, password: testUserPassword });
    const accessToken = loginRes.body.data.accessToken;
    const sessionRefreshToken = loginRes.body.data.refreshToken;

    // Attempt with incorrect current password
    const wrongRes = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: 'WrongPassword@123', newPassword: 'UpdatedPassword@123' });
    assert.strictEqual(wrongRes.status, 400);
    assert.ok(wrongRes.body.error.includes('Current password is incorrect'));

    // Succeeded with correct password
    const successRes = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: testUserPassword, newPassword: 'UpdatedPassword@123' });
    assert.strictEqual(successRes.status, 200);
    assert.strictEqual(successRes.body.success, true);

    // Session before password change should be revoked
    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: sessionRefreshToken });
    assert.strictEqual(refreshRes.status, 401);
  });
});
