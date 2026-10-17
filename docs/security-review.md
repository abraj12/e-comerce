# Security Review Findings and Risk Assessment
**ALGIONS AI LABS PRIVATE LIMITED**  
**Project:** Secure, Reusable, Component-Based E-commerce Platform  
**Classification:** Pre-Production Security Audit & Remediation Report  
**Branch:** `fix/razorpay-preproduction`  

---

## 1. Executive Summary

In adherence to Section 7 & 8 of the Engineering Brief, a comprehensive security and reliability review was conducted. All identified vulnerabilities—including mock payment exposure, IDOR in order and invoice access, unescaped invoice HTML injection, cross-customer cart item manipulation, inventory overselling races, unconstrained order state transitions, and SVG upload risks—have been remediated and verified with automated regression tests.

The payment system has been fully transitioned from mock Stripe payments to a genuine **Razorpay** integration using the official Razorpay Node.js SDK with server-side order creation, checkout signature verification, server-side payment capture checks, and signed webhook idempotency.

> [!IMPORTANT]
> **Core Principle**: Absolute (100%) security does not exist. We do not claim leak-proof systems. Instead, we have implemented verifiable, automated security controls and documented all operational boundaries and residual risks.

---

## 2. Implemented Security Controls & Remediation Summary

| Security Area | Identified Issue / Risk | Remediated Control | Verification Suite |
| :--- | :--- | :--- | :--- |
| **Razorpay Payment Gateway** | Replaced mock Stripe-style payments with official Razorpay integration. | Server-side order creation in paise (`amount * 100`), constant-time HMAC-SHA256 signature verification, server-side `payments.fetch()` capture verification, and signed webhook processing. | `tests/integration/payments-webhook.test.ts` (10 tests covering orders, bad signatures, mismatched amounts, uncaptured states, and webhooks). |
| **Public Mock-Payment Access** | Public `/mock-pay` route allowed marking orders paid without payment. | Route removed from production/staging. Restricted strictly to `NODE_ENV === 'test'` with `ENABLE_MOCK_PAYMENTS === true`. Requires authentication. | `tests/integration/payments-webhook.test.ts` & `tests/security/auth-and-rbac.security.test.ts`. |
| **Invoice Authorization** | Anonymous users could retrieve customer invoices by guessing Order ID. | Enforced strict authentication and ownership checks. Guest checkouts require a cryptographically random `guestAccessToken`. | `tests/security/auth-and-rbac.security.test.ts` (Validates 401 for anonymous, 403 for cross-customer, and 200 for valid token). |
| **Invoice HTML Injection (XSS)** | Unescaped dynamic interpolations (names, addresses, SKU, coupons) in HTML template. | Implemented `escapeHtml()` sanitization across all dynamic interpolations before rendering. | Verified in `tests/checkout.e2e.test.ts` and `src/modules/invoices/invoice.service.ts`. |
| **Private Order Protection** | Anonymous users could view full order details including customer phone and address. | Enforced authentication and ownership on `GET /api/orders/:id`. Created separate `GET /api/orders/:orderNumber/track` endpoint disclosing non-sensitive fulfillment info only. | `tests/security/auth-and-rbac.security.test.ts`. |
| **Cart Item Ownership** | Items were updated or deleted by `itemId` alone, enabling cross-customer cart tampering. | Added `cartId` ownership checks to database queries in `cartService.updateItemQuantity` and `cartService.removeItem`. | `tests/security/auth-and-rbac.security.test.ts` (Validates 404/rejection when Customer B attempts to modify Customer A's item). |
| **Inventory Concurrency & Overselling** | Read-then-increment logic permitted overselling under concurrent checkouts. | Implemented optimistic concurrency locking using `version` guards and backoff retry loop in `inventoryService.reserveStock`. | `tests/concurrency/inventory-overselling.test.ts` (10 concurrent requests for 2 items: exactly 2 succeed, 8 fail; concurrent checkout test). |
| **Order State Machine** | Any order status could be arbitrarily set, allowing stock corruption. | Defined `ALLOWED_ORDER_STATUS_TRANSITIONS` state machine. Prohibits illegal transitions (e.g., CANCELLED -> PAID or DELIVERED -> PENDING). Restocks only once. | `tests/security/auth-and-rbac.security.test.ts`. |
| **Refresh-Token Race Condition** | Concurrent refresh requests could reuse old refresh tokens. | Implemented atomic revocation `updateMany({ where: { id, revokedAt: null } })` in `token.ts`. | `src/core/authentication/token.ts`. |
| **File Upload SVG XSS** | `image/svg+xml` was allowed in uploads, posing Stored XSS risk. | Removed SVG from `ALLOWED_MIME_TYPES`. Added `X-Content-Type-Options: nosniff` and `Content-Security-Policy: default-src 'none'` to `/uploads`. | `src/core/storage/storageProvider.ts` and `src/app.ts`. |
| **Payment Rate Limiting** | Payment endpoints lacked rate limiting, exposing backend to abuse. | Added `paymentRateLimiter` (50 req/15 min) to `/create-order`, `/create-intent`, and `/verify`. | `src/core/authentication/rateLimiter.ts` & `src/modules/payments/payment.routes.ts`. |
| **Settings Exposure & Injection** | `GET /api/settings` dumped all keys; `POST` lacked validation. | Whitelisted safe public settings in `GET`; added Zod schema rejecting secret/credential keys in `POST`. | `src/modules/settings/settings.routes.ts`. |
| **Demo Admin Seed Guard** | `seed.ts` contained hardcoded `Admin@123456` password. | Refuses to run with default credentials in production unless `SEED_ADMIN_PASSWORD` is explicitly configured. | `prisma/seed.ts`. |

---

## 3. Documented Limitations & Operational Recommendations

1. **Reverse Proxy IP Forwarding (`X-Forwarded-For`)**:
   - *Risk*: When deployed behind a reverse proxy (e.g., AWS ALB, Nginx, Cloudflare), `express-rate-limit` requires `app.set('trust proxy', 1)`. If unset or misconfigured, all traffic may share the proxy IP quota.
   - *Recommendation*: Configure `trust proxy` in `src/app.ts` based on your production ingress topology.

2. **Production Database Engine (PostgreSQL)**:
   - *Risk*: The application has been developed and verified with SQLite locally and in CI. While Prisma abstractions and optimistic version checks are database-agnostic, production deployments must configure a dedicated PostgreSQL instance per shop.
   - *Recommendation*: Set `provider = "postgresql"` in `prisma/schema.prisma` and configure `DATABASE_URL` before production go-live. Verify PostgreSQL connection pooling and max connections.

3. **Stateless JWT Lifetime**:
   - *Risk*: Access tokens are stateless and expire after 2 hours. If an employee account is immediately deactivated, their active JWT remains valid until the 2-hour expiration unless a centralized token revocation cache (e.g., Redis) is introduced.
   - *Recommendation*: For environments requiring instant sub-minute session termination across all active JWTs, implement a Redis-backed token revocation denylist.

4. **Razorpay Live Activation**:
   - *Status*: The backend is fully tested and verified against Razorpay Test Mode and mocked SDK responses.
   - *Recommendation*: Before enabling live payments, register your webhook URL (`https://your-domain.com/api/payments/webhook`) in the Razorpay Dashboard, set the live secret in `RAZORPAY_WEBHOOK_SECRET`, and test one live end-to-end transaction with a low amount (e.g., ₹1.00).
