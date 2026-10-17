# Secure, Reusable, Component-Based E-Commerce Platform
**Organisation:** ALGIONS AI LABS PRIVATE LIMITED  
**License:** Apache-2.0  
**Node.js Version:** v20+ / v22+ LTS  
**Branch:** `fix/razorpay-preproduction`  

A complete, production-grade e-commerce application and platform for retail businesses. Built with a modern **Next.js 14** frontend and an enterprise **Express + TypeScript + Prisma** backend.

---

## 📁 Repository Structure

```
e-comerce/
├── backend/                  # Express REST API, Prisma ORM & Business Logic
│   ├── src/                  # Core modules, authentication, RBAC, services
│   ├── prisma/               # Prisma schema & idempotent demo seed script
│   ├── tests/                # 74 automated unit, security, concurrency & e2e tests
│   ├── docs/                 # Architecture, security review, openapi spec
│   ├── dev.db                # SQLite local development database
│   ├── package.json          # Backend dependencies & test scripts
│   └── tsconfig.json         # Backend TypeScript configuration
│
├── frontend/                 # Modern Next.js 14 App Router Web Application
│   ├── app/
│   │   ├── page.tsx          # Storefront (catalog, search, categories, quick-view, cart drawer)
│   │   ├── login/            # Customer authentication & 1-click test login
│   │   ├── checkout/         # Multi-step checkout with delivery, COD & Razorpay modal
│   │   ├── orders/track/     # Real-time public fulfillment tracking stepper
│   │   ├── admin/            # Operations dashboard (sales, inventory, low stock)
│   │   ├── admin/login/      # Role-based staff/admin authentication portal
│   │   ├── lib/api.ts        # Typed API client
│   │   └── globals.css       # Clean, responsive styles
│   ├── next.config.mjs       # Reverse-proxy rewrite rules to Backend API
│   ├── package.json          # Next.js 14 & React 18 dependencies
│   └── tsconfig.json         # Frontend TypeScript configuration
│
├── scripts/
│   └── test-e2e-client.mjs   # Full-stack integration smoke test
├── package.json              # Monorepo scripts (dev, build, test, seed)
└── .gitignore                # Workspace gitignore (.next, node_modules, dev.db)
```

---

## 🚀 Quick Start Guide

### 1. Install Dependencies
```bash
# In backend
cd backend && npm install

# In frontend
cd ../frontend && npm install

# In root
cd .. && npm install
```

### 2. Seed the Database
Populate the database with rich retail products, variants, delivery zones, coupons, and staff accounts:
```bash
npm run seed
```

### 3. Run the Platform in Development
Start both the Express backend (Port 3000) and Next.js frontend (Port 3001) simultaneously:
```bash
npm run dev
```

- 🛒 **Storefront**: [http://localhost:3001](http://localhost:3001)
- 🔐 **Customer Login**: [http://localhost:3001/login](http://localhost:3001/login)
- 💳 **Checkout**: [http://localhost:3001/checkout](http://localhost:3001/checkout)
- 🚚 **Order Tracker**: [http://localhost:3001/orders/track](http://localhost:3001/orders/track)
- 🏢 **Admin Dashboard**: [http://localhost:3001/admin](http://localhost:3001/admin)
- 👔 **Staff/Admin Login**: [http://localhost:3001/admin/login](http://localhost:3001/admin/login)
- 📖 **OpenAPI / Swagger UI**: [http://localhost:3000/api-docs](http://localhost:3000/api-docs)

---

## 🔑 Demo Credentials (with 1-Click Login)

The frontend includes pre-filled 1-click test buttons for quick evaluation:

| Role | Email | Password | Access Level |
|---|---|---|---|
| **Customer** | `customer@example.com` | `Customer@123456` | Storefront, cart, checkout, profile |
| **System Admin** | `admin@algions.local` | `Admin@123456` | Wildcard access (`*` on `*`), security audits |
| **Store Manager** | `manager@algions.local` | `Staff@123456` | Products, inventory, orders, analytics |
| **Inventory Staff** | `staff@algions.local` | `Staff@123456` | Restocking, inventory counts, pack orders |
| **Delivery Rider** | `rider@algions.local` | `Rider@123456` | Assigned deliveries, dispatch updates |

### Active Demo Vouchers & Delivery Zones
- **Coupon `SAVE10`**: 10% discount capped at ₹100.
- **Coupon `FLAT50`**: Flat ₹50 discount on orders above ₹299.
- **Serviceable Delivery PINs**: `560001`, `560002`, `560025`, `560009` (Central City Sector, free delivery above ₹350).

---

## 🧪 Automated Testing

The backend includes a comprehensive suite of **74 passing automated tests**:

```bash
# Run all unit, security, concurrency, integration tests (68 tests)
npm test

# Run End-to-End customer checkout journey (6 tests)
npm run test:e2e

# Run security & OWASP RBAC verification
npm run test:security
```

### Test Coverage Highlights:
- **Security & OWASP**: Deny-by-default, IDOR defense on orders & invoices, guest order tokens, XSS-escaping in HTML invoices, SVG raster rejection, Helmet security headers.
- **Concurrency & Oversell Prevention**: Concurrent checkout race-condition testing using optimistic locking (`version` guard) ensuring zero inventory oversell.
- **Pricing & Promotions**: Exact subtotal calculation, percentage & fixed caps, tax calculations.
- **Payment Lifecycle**: Official Razorpay SDK HMAC signature validation, timing-safe checks, idempotent webhooks.

---

## 🛠️ Monorepo Commands

| Command | Action |
|---|---|
| `npm run dev` | Runs backend (port 3000) and frontend (port 3001) concurrently |
| `npm run dev:backend` | Runs only the Express backend with hot reloading |
| `npm run dev:frontend` | Runs only Next.js frontend with hot reloading |
| `npm run build` | Compiles both backend TypeScript and Next.js frontend |
| `npm run seed` | Seeds SQLite database with demo accounts, catalog, zones, and coupons |
| `npm test` | Runs the backend automated test suite |
| `npm run test:e2e` | Runs end-to-end customer checkout tests |
