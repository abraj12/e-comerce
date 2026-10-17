# Deployment and Setup Guide
**ALGIONS AI LABS PRIVATE LIMITED**  
**Project:** Secure, Reusable, Component-Based E-commerce Platform  

This document outlines how engineers can install, configure, test, and independently deploy this e-commerce platform for retail clients (clothing stores, grocery shops, electronics shops, sweet shops).

---

## 1. Prerequisites
- **Node.js**: `v20.x` or `v22.x` (LTS recommended, tested on Node `v22.18.0`)
- **Package Manager**: `npm` (`v10+` or `v11+`)
- **Database**:
  - **Development / Standalone**: SQLite (zero-dependency, included by default)
  - **Production Client Deployments**: PostgreSQL `v14+` / `v15+` / `v16+`

---

## 2. Local Setup and Installation

### Step 1: Clone or Copy Central Repository
```bash
cd /path/to/project-directory
```

### Step 2: Install Verified Dependencies
```bash
npm install
```

### Step 3: Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Ensure secrets are properly randomized in production:
```bash
# Generate high-entropy 32-byte hex keys:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Step 4: Database Synchronization & Seeding
```bash
# Push Prisma schema to database (creates tables & indexes)
npm run prisma:push

# Seed default store data, categories, sample retail products, delivery zones, and employee accounts
npm run prisma:seed
```

### Step 5: Run Automated Test Suites
```bash
# Run complete test suite (Unit, Security, Concurrency, Integrations, E2E)
npm test

# Or run individual verification suites:
npm run test:unit
npm run test:security
npm run test:concurrency
npm run test:integration
npm run test:e2e
```

### Step 6: Start the Server
```bash
# Development mode with hot-reloading:
npm run dev

# Or direct start:
npm start
```
The server will be available at:
- **Customer Storefront**: `http://localhost:3000/`
- **Shop Operations Admin**: `http://localhost:3000/admin/`
- **Interactive OpenAPI Docs**: `http://localhost:3000/api-docs`
- **Health Check API**: `http://localhost:3000/api/health`

---

## 3. Default Seed Credentials (Development)

| Role | Email | Password | Access Level |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@algions.local` | `Admin@123456` | Full system access, audit logs, employee management |
| **Manager** | `manager@algions.local` | `Staff@123456` | Catalogue, stock adjustment, coupons, reports |
| **Staff** | `staff@algions.local` | `Staff@123456` | Inventory view/update, order processing |
| **Delivery**| `rider@algions.local` | `Rider@123456` | Delivery order dispatch & status updates |
| **Customer**| `customer@example.com` | `Customer@123456`| Storefront shopping, cart, orders, reviews |

---

## 4. Production Client Deployment Architecture

Per Section 6 of the brief, **each client project has its own independently deployed backend, database, storage, and credentials**:

```mermaid
graph TD
    subgraph Client A: Organic Grocery Mart
        BE_A[Independent Node.js Service]
        DB_A[(Dedicated PostgreSQL DB)]
        S3_A[Dedicated S3 Bucket]
        ENV_A[.env Secrets A]
        BE_A --> DB_A
        BE_A --> S3_A
        BE_A --> ENV_A
    end

    subgraph Client B: Traditional Sweet Shop
        BE_B[Independent Node.js Service]
        DB_B[(Dedicated PostgreSQL DB)]
        S3_B[Dedicated S3 Bucket]
        ENV_B[.env Secrets B]
        BE_B --> DB_B
        BE_B --> S3_B
        BE_B --> ENV_B
    end

    subgraph Client C: Apparel Boutique
        BE_C[Independent Node.js Service]
        DB_C[(Dedicated PostgreSQL DB)]
        S3_C[Dedicated S3 Bucket]
        ENV_C[.env Secrets C]
        BE_C --> DB_C
        BE_C --> S3_C
        BE_C --> ENV_C
    end
```

### Deploying for PostgreSQL
In `prisma/schema.prisma`, update the datasource:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```
Set in `.env`:
```env
DATABASE_URL="postgresql://dbuser:strongpassword@postgres-host:5432/client_shop_db?schema=public"
```
Run database migrations:
```bash
npx prisma migrate deploy
```

### Production Process Manager (PM2 / Systemd / Docker)
Example `ecosystem.config.cjs` for PM2:
```javascript
module.exports = {
  apps: [{
    name: 'algions-ecommerce',
    script: 'dist/server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
```
Build and run:
```bash
npm run build
pm2 start ecosystem.config.cjs
```
