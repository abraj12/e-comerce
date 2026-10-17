# Deployment and Setup Guide
**ALGIONS AI LABS PRIVATE LIMITED**  
**Project:** Secure, Reusable, Component-Based E-Commerce Platform with Razorpay  
**Branch:** `fix/razorpay-preproduction`  

This document outlines how backend and DevOps engineers can configure, test, and independently deploy this e-commerce platform for retail clients (groceries, sweet shops, apparel boutiques, electronics).

---

## 1. Prerequisites

- **Node.js**: `v20.x` or `v22.x` LTS (tested on Node `v22.18.0`)
- **Package Manager**: `npm` (`v10+` or `v11+`)
- **Database**:
  - **Local Development / Automated Testing**: SQLite (`file:./dev.db`)
  - **Production Deployments**: PostgreSQL `v14+` / `v15+` / `v16+` (one dedicated database per client shop)
- **Payment Gateway**: Active Razorpay Account (Test Mode for staging, Live Mode for production)

---

## 2. Environment Variables Specification

Configure the following variables in `.env` (or through your cloud secret manager):

```env
# Server Runtime
NODE_ENV=development             # 'development' | 'production' | 'test'
PORT=3000                        # HTTP port
BASE_URL=http://localhost:3000   # Public base URL of the store backend
ALLOWED_ORIGINS=                 # Comma-separated CORS allowed origins (production)

# Database Connection
DATABASE_URL="file:./dev.db"     # SQLite for local dev, PostgreSQL connection string for prod

# Cryptographic & Authentication Secrets (Minimum 32 random characters in production)
JWT_SECRET=                      # Secret for signing access tokens
REFRESH_SECRET=                  # Secret for signing refresh tokens
COOKIE_SECRET=                   # Secret for signing cookies

# Razorpay Payment Gateway Configuration
RAZORPAY_KEY_ID=                 # Razorpay Key ID (rzp_test_... or rzp_live_...)
RAZORPAY_KEY_SECRET=             # Razorpay Key Secret from Dashboard
RAZORPAY_WEBHOOK_SECRET=         # Secret configured in Razorpay Webhook Dashboard

# Mock Payments Flag (Strictly disabled in production; only enabled in isolated automated tests)
ENABLE_MOCK_PAYMENTS=false

# SMTP / Email Alerts
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=
SMTP_PASS=
SMTP_FROM=no-reply@algions-retail.local

# Storage & Profile Defaults
UPLOAD_DIR=./public/uploads
MAX_FILE_SIZE_BYTES=5242880      # 5 MB
STORE_NAME="ALGIONS Retail Mart"
STORE_CURRENCY=INR
STORE_EMAIL=retail@algions.com
STORE_PHONE=+919876543210
TAX_RATE_PERCENTAGE=5.0
LOW_STOCK_DEFAULT_THRESHOLD=5
```

> [!CAUTION]
> Never commit `.env` or production credentials to source control. Generate production secrets with:
> `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

---

## 3. Razorpay Integration & Configuration

### A. Setting Up Razorpay Test Mode
1. Log in to the [Razorpay Dashboard](https://dashboard.razorpay.com/).
2. Switch the dashboard toggle from **Live Mode** to **Test Mode**.
3. Navigate to **Settings > API Keys** and click **Generate Key**.
4. Copy the generated **Key ID** and **Key Secret**.
5. Set in `.env`:
   ```env
   RAZORPAY_KEY_ID=rzp_test_YourGeneratedKeyId
   RAZORPAY_KEY_SECRET=YourGeneratedKeySecret
   ```

### B. Configuring Razorpay Webhook Endpoint
1. In the Razorpay Dashboard, navigate to **Settings > Webhooks > Add New Webhook**.
2. **Webhook URL**: Enter `https://<your-store-domain>/api/payments/webhook`.
3. **Secret**: Enter a high-entropy secret string and copy it to `RAZORPAY_WEBHOOK_SECRET` in `.env`.
4. **Active Events**: Select the following supported events:
   - `payment.captured`
   - `order.paid`
   - `payment.failed`
5. Save the webhook.

### C. Webhook Verification & Idempotency
- Incoming requests to `/api/payments/webhook` are cryptographically verified using HMAC-SHA256 computed on the exact raw request body buffer and compared against the `X-Razorpay-Signature` header.
- The webhook processing pipeline is strictly idempotent: repeated delivery of the same webhook payload will detect the completed status and return `{ received: true, duplicate: true }` without committing stock twice or creating duplicate transactions.

---

## 4. Local Setup and Verification

```bash
# 1. Install verified dependencies
npm ci

# 2. Synchronize database schema and generate Prisma client
npm run prisma:generate
npm run prisma:push

# 3. Seed initial store data (development mode)
npm run prisma:seed

# 4. Run automated test suite
npm test

# 5. Build TypeScript distribution
npm run build

# 6. Start the server
npm start
```

---

## 5. Production Deployment Preparation Checklist

Before promoting a shop deployment to production:

1. [ ] **Isolated Deployment Architecture**: Confirm that this shop instance has its own dedicated application process, database, and credentials. Do not share databases across multiple shops.
2. [ ] **PostgreSQL Migration**:
   - In `prisma/schema.prisma`, change `provider = "sqlite"` to `provider = "postgresql"`.
   - Update `DATABASE_URL` to point to the shop's PostgreSQL cluster.
   - Run `npx prisma migrate deploy` or `npm run prisma:push`.
3. [ ] **Environment Validation at Startup**: Ensure `NODE_ENV=production`. The application will validate that `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` are configured and not mock placeholders.
4. [ ] **Mock Payments Disabled**: Verify `ENABLE_MOCK_PAYMENTS=false`. Startup validation will abort if mock payments are enabled in production.
5. [ ] **Production Admin Password**: Set `SEED_ADMIN_PASSWORD` in the environment before running database seeding. The seed script refuses to run with default credentials in production.
6. [ ] **Reverse Proxy & Trust Proxy**: If deployed behind AWS ALB, Cloudflare, or Nginx, ensure `trust proxy` is configured in Express for accurate client IP rate limiting.
7. [ ] **CORS Origins**: Specify exact storefront domains in `ALLOWED_ORIGINS` (e.g., `https://clientstore.com`).
8. [ ] **CSP Whitelist**: Verify that `https://checkout.razorpay.com`, `https://api.razorpay.com`, and `https://lumberjack.razorpay.com` are allowed in Helmet CSP headers (pre-configured in `src/app.ts`).

---

## 6. Known Limitations and Unsupported Scenarios

1. **Refunds Workflow**:
   - The application supports recording `REFUNDED` status transitions and restocking items via `orderService.updateOrderStatus`. Automated programmatic refund API issuance directly via Razorpay Refunds API is not implemented in this phase and requires administrative execution from the Razorpay Dashboard.
2. **Subscription / Recurring Payments**:
   - The current integration handles one-time checkout orders for goods and local delivery. Razorpay Subscriptions / Mandates are not supported.
3. **Multi-Currency Settlements**:
   - Store transactions are priced and settled exclusively in Indian Rupees (INR) using paise calculations. International multi-currency conversion is not configured.
