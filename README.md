# Secure, Reusable, Component-Based E-Commerce Platform
**Organisation:** ALGIONS AI LABS PRIVATE LIMITED  
**License:** Apache-2.0  
**Node.js Version:** v20+ / v22+ LTS  

A complete, production-grade e-commerce application and backend for local retail businesses (groceries, sweet shops, apparel boutiques, electronics). Built according to the core principle: **"Reuse working, well-maintained open-source code instead of writing every feature from scratch."**

---

## 🚀 Key Capabilities

- **Core Foundation**: Type-safe relational schema with [Prisma](https://github.com/prisma/prisma) (SQLite/PostgreSQL), strict [Zod](https://github.com/colinhacks/zod) runtime boundary validation, structured JSON logging, and database audit logs.
- **Access Control & Security**: Server-side [Casbin](https://github.com/apache/casbin-node-casbin) RBAC enforcer with deny-by-default access, bcrypt (12 salt rounds), rotating session tokens, sliding-window rate limiters, and IDOR protection.
- **Product Catalogue**: Multi-variant products (size, color, weight), master SKU, slug generator, image upload with MIME validation, and multi-filter search.
- **Inventory & Oversell Prevention**: Atomic database transactions (`$transaction`) with conditional stock reservations (`available >= requested`), preventing overselling under high concurrency. Real-time low-stock alerts.
- **Shopping Cart & Checkout**: Customer & guest session carts, real-time stock checks, dynamic taxes, and discount coupons with maximum caps and threshold rules.
- **Local Delivery & PIN Zones**: PIN code serviceability validation, delivery fee rules, free delivery thresholds, and order assignment to delivery personnel.
- **Orders & Payments**: Order lifecycle state machine, Cash on Delivery (COD), Stripe payment intents, and signed webhook handler with HMAC-SHA256 signature verification and timestamp replay defense.
- **Invoices & Receipts**: Automated tax invoice generation with breakdown of items, discounts, GST/tax, delivery fees, and printable HTML receipts.
- **Reporting & Operational Dashboards**: Sales revenue, order status distribution, best-selling products, low-stock warnings, and security audit log query.
- **Interactive UI & Documentation**:
  - 🛒 **Customer Storefront**: Responsive shopping catalog, product quick-view, cart drawer, checkout modal, and order tracking.
  - 🏢 **Operations Admin Portal**: Shop management dashboard for products, inventory restock, order fulfillment, delivery zones, and audit logs.
  - 📖 **Interactive OpenAPI 3.0 UI**: Swagger UI explorer hosted at `/api-docs`.

---

## 🏗️ Architecture

```mermaid
graph TD
    subgraph Client Application Layer
        SF[Responsive Customer Storefront<br/>/ - public/index.html & js/storefront.js]
        ADM[Operations Admin Portal<br/>/admin/ - public/admin/index.html & admin.js]
        SWAG[Interactive OpenAPI Explorer<br/>/api-docs & docs/openapi.json]
    end

    subgraph Commerce Modules Layer
        AUTH_M[modules/auth<br/>Login, Register, Refresh, Sessions]
        PROD_M[modules/products<br/>Variants, SKU, Search, Filter]
        INV_M[modules/inventory<br/>Atomic Reservation, Oversell Defense]
        CART_M[modules/cart<br/>Customer & Guest Cart, Dynamic Subtotals]
        PROMO_M[modules/promotions<br/>Coupons, Discounts, Caps]
        DELIV_M[modules/delivery<br/>PIN Code Matching, Fees, Dispatch]
        ORDER_M[modules/orders<br/>Atomic Checkout, Order State Machine]
        PAY_M[modules/payments<br/>COD, Stripe, Signed Webhooks]
        INVCE_M[modules/invoices<br/>HTML & Structured Tax Invoices]
        REPORT_M[modules/reporting<br/>Sales, Low Stock, Audit Logs]
    end

    subgraph Core Foundational Services
        CONFIG[core/config<br/>Zod-Validated Env Schema]
        DB[core/database<br/>Prisma ORM & Parameterized SQL]
        AUTHZ[core/authorization<br/>Casbin Policy RBAC Engine]
        VALID[core/validation<br/>Strict Zod Request Middleware]
        LOG[core/logging<br/>Structured Logger & DB Audit Trail]
        BUS[core/events<br/>Decoupled Async Event Bus]
        STORE[core/storage<br/>Multer with MIME Whitelist & 5MB Limit]
    end

    SF --> ORDER_M
    SF --> CART_M
    SF --> PROD_M
    ADM --> PROD_M
    ADM --> INV_M
    ADM --> ORDER_M
    ADM --> DELIV_M
    ADM --> REPORT_M

    ORDER_M --> INV_M
    ORDER_M --> PROMO_M
    ORDER_M --> DELIV_M
    ORDER_M --> PAY_M
    ORDER_M --> INVCE_M
    ORDER_M --> BUS

    ORDER_M --> DB
    AUTH_M --> AUTHZ
    AUTHZ --> DB
    VALID --> PROD_M
    VALID --> ORDER_M
```

---

## 🧪 Automated Test Suite (34 Tests, 100% Passing)

Testing covers the assembled application:
- **Unit Tests**: Pricing, discount calculations, tax rules, and coupon limits (`tests/unit/`).
- **Security & RBAC Tests**: Deny-by-default (401), privilege escalation defense (403), Casbin policy wildcard check, input validation (400), and horizontal authorization / IDOR defense (`tests/security/`).
- **High-Concurrency Tests**: 10 simultaneous requests for 2 stock units yield exactly 2 successes and 8 failures, with stock remaining strictly at 0 without overselling (`tests/concurrency/`).
- **Payment & Webhook Tests**: HMAC-SHA256 webhook signature verification, replay attack defense with timestamp tolerance window, and idempotency (`tests/integration/`).
- **Local Delivery Tests**: PIN code matching, delivery fee rules, and free delivery thresholds (`tests/integration/`).
- **End-to-End Checkout**: Full customer journey from registration to product selection, cart, coupon application, checkout, invoice generation, and tracking (`tests/checkout.e2e.test.ts`).
- **Post-Deployment Smoke Tests**: Health checks, database connectivity, and security headers (`tests/smoke.test.ts`).

```bash
# Run all automated tests:
npm test
```

---

## ⚡ Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
```

### 3. Initialize Database & Seed Sample Retail Store Data
```bash
npm run prisma:push
npm run prisma:seed
```

### 4. Start the Application
```bash
npm start
```

- **Storefront**: [http://localhost:3000/](http://localhost:3000/)
- **Admin Dashboard**: [http://localhost:3000/admin/](http://localhost:3000/admin/)
- **OpenAPI Interactive Documentation**: [http://localhost:3000/api-docs](http://localhost:3000/api-docs)
- **Health Check API**: [http://localhost:3000/api/health](http://localhost:3000/api/health)

### Default Test Accounts
- **Admin**: `admin@algions.local` / `Admin@123456`
- **Manager**: `manager@algions.local` / `Staff@123456`
- **Staff**: `staff@algions.local` / `Staff@123456`
- **Delivery**: `rider@algions.local` / `Rider@123456`
- **Customer**: `customer@example.com` / `Customer@123456`

---

## 📚 Documentation
- [Architecture Decision Record & Specification](docs/components-catalog.md)
- [Independent Client Deployment Guide](docs/deployment.md)
- [Open-Source Dependency & License Inventory](docs/licenses-inventory.md)
- [Security Review & Residual Risk Assessment](docs/security-review.md)
- [OpenAPI 3.0 Contract Specification](docs/openapi.json)
