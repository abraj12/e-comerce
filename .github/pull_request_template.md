## Summary of Changes

This Pull Request integrates the official Razorpay Node.js SDK, hardens application security across all subsystems, and prepares the platform for pre-production retail testing under an independent single-tenant shop deployment model.

### 1. Payment Gateway & Webhook (Razorpay)
- **Official SDK**: Replaced mock Stripe adapter with official `razorpay` SDK (v2.9.8) in [`src/integrations/payment/razorpayAdapter.ts`](file:///d:/e-comerce/src/integrations/payment/razorpayAdapter.ts).
- **Paise Unit Calculation**: Integer conversion strictly enforced via `Math.round(total * 100)`.
- **Timing-Safe Verification**: Client checkout signature verified with HMAC-SHA256 using `crypto.timingSafeEqual`.
- **Capture Verification**: Verified payment capture status and amount via `razorpay.payments.fetch(paymentId)`.
- **Webhook Processing**: Validates `X-Razorpay-Signature` against raw body buffer; handles `payment.captured`, `payment.failed`, and `order.paid` idempotently.
- **Production Guard**: Mock payment routes strictly blocked in `NODE_ENV=production`.

### 2. Authentication & Account Recovery
- **Password Recovery**: Implemented `/forgot-password`, `/reset-password`, and `/change-password` routes.
- **Cryptographic Security**: 32-byte cryptographic random reset tokens; SHA-256 hash stored in DB with 15-minute expiration.
- **Session Revocation**: Automatically revokes all existing refresh sessions on password reset via `revokeAllUserSessions()`.
- **Anti-Enumeration**: Generic messages prevent email enumeration.
- **Rate Limiting**: Added `passwordResetRateLimiter` (5 req / 15 min).

### 3. Shopping Cart & Authoritative Pricing
- **Cart ID Scoping**: Scoped all cart item updates and deletes by `cartId` to eliminate cross-customer IDOR tampering.
- **Server-Side Recalculation**: Live variant prices recalculated from database at checkout; client price overrides are rejected.

### 4. Inventory Concurrency & State Machine
- **Optimistic Concurrency Control (OCC)**: Added integer `version` field to `InventoryItem` and `ProductVariant` with retry loop to eliminate overselling under concurrent checkout attempts.
- **Order State Machine**: Enforced valid lifecycle transitions via `ALLOWED_ORDER_STATUS_TRANSITIONS`.
- **Safe Public Tracking**: Public tracking endpoint (`/api/orders/:orderNumber/track`) masks customer PII (phone, email, full address).

### 5. Document Rendering & File Upload Hardening
- **Invoice XSS Sanitization**: Added `escapeHtml()` escaping across all dynamic customer and order fields in invoice templates.
- **File Upload Security**: Removed `image/svg+xml` from allowed upload MIME types to prevent Stored XSS; configured Multer to return `400 Bad Request` on invalid file types.
- **Uploads Static Headers**: Added `X-Content-Type-Options: nosniff` and CSP headers to static `/uploads`.

### 6. Reporting & Settings Security
- **Financial Accuracy**: Revenue derives strictly from `paymentStatus: COMPLETED` orders; stock calculation accounts for active reservations.
- **Store Settings**: Filtered public `/api/settings` through whitelist to prevent leaking operational secrets.

### 7. CI & Automated Dependency Auditing
- Added `.github/workflows/ci.yml` (schema validate, full test suite, TypeScript compile).
- Added `.github/dependabot.yml` for automated weekly dependency vulnerability scans.

---

## Test & Verification Evidence

All 74 tests across 10 suites pass with zero failures:

```
# Unit Tests (Pricing, Coupons & Promotions): 4 passed
# Unit Tests (Authentication & Sessions): 6 passed
# Concurrency Tests (Inventory OCC Overselling): 3 passed
# Integration Tests (Razorpay Payments & Webhooks): 7 passed
# Integration Tests (Delivery & Serviceability): 8 passed
# Integration Tests (Cart Price Recalculation): 2 passed
# Security Tests (Account Recovery & Reset): 8 passed
# Security Tests (OWASP RBAC, IDOR, XSS, SVG Rejection): 24 passed
# Smoke Tests (Health Check, Helmet, UI, OpenAPI): 6 passed
# E2E Tests (Customer Checkout Journey): 6 passed
# -------------------------------------------------------------
# Total: 74 passed, 0 failed
```

- `npx prisma validate` $\rightarrow$ Valid schema
- `npm run build` $\rightarrow$ `tsc` exits 0 with zero errors

---

## Deployment & Pre-Production Checklist

1. [ ] Set `NODE_ENV=production` in the shop container environment.
2. [ ] Populate live `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET`.
3. [ ] Register webhook URL: `https://<shop-domain>/api/payments/webhook` in Razorpay Dashboard.
4. [ ] For PostgreSQL production database, set `DATABASE_URL` and run `npx prisma migrate deploy`.
5. [ ] Configure reverse proxy to forward client IPs (`app.set('trust proxy', 1)`).
