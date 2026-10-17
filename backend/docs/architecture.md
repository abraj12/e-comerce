# System Architecture Specification & Feature Blueprint
**ALGIONS AI LABS PRIVATE LIMITED**  
**Project:** Secure, Reusable, Component-Based E-Commerce Platform  
**Target Environment:** Node.js, Express, TypeScript, Prisma ORM, Razorpay Gateway  
**Deployment Model:** Independent Shop Deployment (Isolated database, application instance, configuration, storage, and credentials per retail client)

---

## 1. Architectural Principles & Deployment Model

The ALGIONS E-Commerce Platform is engineered around four core architectural principles:

1. **Independent Single-Tenant Deployment per Shop**: Each shop (grocery, confectionery, boutique, or electronics retailer) operates as an entirely self-contained deployment. There is **no multi-tenant shared database or shared memory**. Each shop instance maintains its own:
   - Dedicated application process and container.
   - Dedicated database (PostgreSQL in production; SQLite in local dev/testing).
   - Dedicated file storage volume for uploads.
   - Dedicated Razorpay API keys and webhook secrets.
   - Dedicated JWT signing keys and session store.
2. **Audited Component Reuse**: Proven, maintained open-source libraries and standards are integrated rather than reinventing foundational components:
   - **Payment Gateway**: Official `razorpay` SDK (v2.9.8).
   - **Access Control**: Casbin RBAC (`casbin` v5.51).
   - **Input Validation**: Zod runtime schemas (`zod` v3.24).
   - **Data Access & Concurrency**: Prisma ORM with optimistic version concurrency control.
   - **Security Hardening**: Helmet CSP, bcrypt (12 rounds), express-rate-limit, OWASP threat mitigations.
3. **Defense-in-Depth & Zero-Trust Inputs**: Client browsers are completely untrusted. All prices, discount percentages, inventory availability, order totals, and access permissions are calculated and verified authoritatively on the server.
4. **Transactional & Idempotent Operations**: All financial, stock reservation, and payment state transitions execute inside atomic database transactions with strict idempotency guards against network retries and duplicate webhooks.

---

## 2. High-Level System Architecture Diagram

```mermaid
flowchart TD
    subgraph Clients["Client Layer"]
        Storefront["Storefront Web App (Customers)"]
        AdminDashboard["Admin Dashboard (Admin / Manager / Staff)"]
        DeliveryApp["Delivery Tracking Interface"]
        RzpCheckout["Razorpay Checkout Modal"]
    end

    subgraph Gateway["Edge & Ingress Layer"]
        ReverseProxy["Reverse Proxy (Nginx / Cloudflare / AWS ALB)"]
        SecurityHeaders["Helmet CSP & Security Headers"]
        RateLimiters["Express Rate Limiters (Auth, Password, Payment, API)"]
    end

    subgraph CoreEngine["Application Engine (Express 5 + TypeScript)"]
        Router["Express Router & Dispatcher"]
        AuthMiddleware["JWT Authenticator & Session Validator"]
        RBACGuard["Casbin Authorization Guard (5 Roles)"]
        ValidationMiddleware["Zod Schema Validator"]
        
        subgraph Modules["Domain Modules"]
            AuthModule["Auth & Account Recovery Module"]
            ProductModule["Products & Categories Module"]
            CartModule["Cart Ownership & Pricing Module"]
            InventoryModule["Inventory & Concurrency Module"]
            OrderModule["Order State Machine Module"]
            PaymentModule["Razorpay Payment Module"]
            PromotionModule["Coupons & Promotions Module"]
            DeliveryModule["Delivery Zones & PIN Check Module"]
            InvoiceModule["Invoice Generation & XSS Sanitizer"]
            ReportingModule["Reporting & Analytics Module"]
            AuditModule["Audit Trail & Structured Logger"]
        end
    end

    subgraph DataLayer["Data & Persistence Layer"]
        PrismaORM["Prisma ORM Client"]
        Database[("Dedicated Database (PostgreSQL / SQLite)")]
        StorageVolume["Protected Uploads Storage (nosniff + CSP)"]
    end

    subgraph Integrations["External Services"]
        RazorpayAPI["Razorpay API (Order Creation & Capture Fetch)"]
        RazorpayWebhooks["Razorpay Webhooks (HMAC-SHA256 Signed Events)"]
        SMTPServer["SMTP Mail Server (Order Confirmations & Alerts)"]
    end

    Clients --> ReverseProxy
    ReverseProxy --> SecurityHeaders
    SecurityHeaders --> RateLimiters
    RateLimiters --> Router
    Router --> AuthMiddleware
    AuthMiddleware --> RBACGuard
    RBACGuard --> ValidationMiddleware
    ValidationMiddleware --> Modules

    Modules --> PrismaORM
    PrismaORM --> Database
    Modules --> StorageVolume
    Modules --> RazorpayAPI
    RazorpayWebhooks --> Router
    Modules --> SMTPServer
```

---

## 3. Comprehensive Feature Matrix by Module

The application provides 13 modular business components organized under `src/modules/` and `src/core/`:

| Module | Core Features & Implementation Details | Security & Reliability Controls |
| :--- | :--- | :--- |
| **1. Authentication & Recovery** (`src/modules/auth`) | • Customer registration and credential login.<br>• Signed HS256 JWT access tokens (2h expiry).<br>• Database-backed refresh sessions with atomic rotation (`validateAndRotateSession`).<br>• Password recovery flow (`/forgot-password` & `/reset-password`).<br>• Authenticated password changes (`/change-password`).<br>• Employee creation and role assignment (`ADMIN` only). | • Anti-enumeration generic responses.<br>• 32-byte cryptographic random reset tokens.<br>• SHA-256 token hash stored in DB with 15-min expiry.<br>• All existing sessions revoked on password reset.<br>• Bcrypt hashing with 12 salt rounds.<br>• `authRateLimiter` & `passwordResetRateLimiter`. |
| **2. Role-Based Access Control** (`src/core/authorization`) | • 5 shop roles: `ADMIN`, `MANAGER`, `STAFF`, `DELIVERY`, `CUSTOMER`.<br>• Fine-grained resource-action permission model.<br>• Casbin adapter with in-memory policy cache.<br>• Reusable route middleware `authorize(resource, action)`. | • Wildcard administration rights for `ADMIN`.<br>• Deny-by-default on all unauthenticated/unauthorized actions.<br>• Customers strictly restricted from administrative, catalogue, and inventory endpoints. |
| **3. Products & Catalog** (`src/modules/products`) | • Hierarchical category navigation and slug routing.<br>• Multi-variant product support (Size, Color, Weight).<br>• Variant SKU generation and inventory association.<br>• Image metadata storage and presentation.<br>• Active/inactive status filters for catalogue visibility. | • Strict Zod schema validation on create and update.<br>• Catalog mutations restricted to `ADMIN` and `MANAGER`.<br>• Soft deactivation checks preventing checkout of disabled products. |
| **4. Categories** (`src/modules/categories`) | • Category tree with optional parent-child nesting.<br>• URL-safe slug auto-generation.<br>• Product association and categorization counts. | • Mutating actions restricted to `ADMIN` and `MANAGER`.<br>• Schema validated slug uniqueness. |
| **5. Shopping Cart** (`src/modules/cart`) | • Guest session carts (`sessionId`) and customer carts (`customerId`).<br>• Add items, update quantities, delete items, clear cart.<br>• Subtotal calculation with item-level totals.<br>• Seamless cart migration from guest session to authenticated customer. | • **Cart Item Ownership**: DB queries scope updates and deletes by `cartId` preventing cross-customer tampering.<br>• Automatic validation of available inventory against reservations. |
| **6. Inventory & Concurrency** (`src/modules/inventory`) | • Real-time tracking of `stockQuantity` and `reservedQuantity`.<br>• Available stock calculated as `stockQuantity - reservedQuantity`.<br>• Atomic stock reservation at checkout.<br>• Automatic restocking on order cancellation.<br>• Low stock threshold detection. | • **Optimistic Concurrency Control**: Uses `version` field guard with backoff retry loop.<br>• Eliminates overselling under concurrent checkout attempts.<br>• Idempotent restocking prevents double-adjustment. |
| **7. Orders & State Machine** (`src/modules/orders`) | • Order creation from cart with atomic transaction execution.<br>• Live server-side price recalculation from database variant prices.<br>• Order lifecycle management: `PENDING` $\rightarrow$ `PAID` / `PROCESSING` $\rightarrow$ `DISPATCHED` $\rightarrow$ `DELIVERED`.<br>• Terminal states: `CANCELLED`, `REFUNDED`.<br>• Public fulfillment tracking via `GET /api/orders/:orderNumber/track`.<br>• Delivery personnel order assignment. | • `ALLOWED_ORDER_STATUS_TRANSITIONS` enforces valid state transitions.<br>• Customer ownership authorization prevents IDOR.<br>• Public tracking exposes fulfillment state only; masks PII (email, phone, address).<br>• Rejects deactivated or price-tampered products. |
| **8. Razorpay Payments** (`src/modules/payments` & `src/integrations/payment`) | • Server-side Razorpay order creation (`orders.create`).<br>• Currency calculation strictly in integer paise (`Math.round(total * 100)`).<br>• Client Checkout launch parameter generation.<br>• Checkout signature verification using HMAC-SHA256.<br>• Server-side payment capture verification via `payments.fetch()`.<br>• Webhook processing for `payment.captured`, `payment.failed`, `order.paid`.<br>• Production-isolated mock payment facility for automated testing. | • Timing-safe signature comparison (`crypto.timingSafeEqual`).<br>• Webhook verification on exact raw request body buffer.<br>• Idempotent webhook handling prevents duplicate transactions.<br>• Mock payment route strictly blocked in production. |
| **9. Promotions & Discounts** (`src/modules/promotions`) | • Percentage discounts (e.g., 10% off) with optional `maxDiscountAmount` cap.<br>• Fixed amount discounts (e.g., ₹100 off).<br>• Minimum order subtotal qualification thresholds.<br>• Coupon expiration dates and usage limit tracking. | • Discount amount can never exceed order subtotal.<br>• Validated server-side at checkout against authoritative subtotal.<br>• Atomic usage increment inside checkout transaction. |
| **10. Delivery & Serviceability** (`src/modules/delivery`) | • Delivery zone management by serviceable PIN codes.<br>• Dynamic delivery fee calculation based on order value.<br>• Free delivery threshold qualification (e.g., free delivery over ₹500).<br>• Store pickup option (`STORE_PICKUP`) with zero delivery fee. | • Pre-checkout PIN code validation prevents unserviceable orders.<br>• Local delivery requires verified recipient address. |
| **11. Invoices & HTML Generation** (`src/modules/invoices`) | • Automated sequential invoice creation (`INV-YYYYMMDD-XXXXXX`).<br>• Itemized breakdown (unit price, quantities, subtotal, tax, delivery, discount).<br>• Print-ready HTML invoice rendering (`GET /api/invoices/:orderId/render`).<br>• Secure guest access via cryptographically random `guestAccessToken`. | • Authentication required for customer invoices (401/403).<br>• Guest invoices require matching `guestAccessToken`.<br>• **XSS Defense**: `escapeHtml()` sanitization applied to all dynamic template interpolations. |
| **12. Reporting & Analytics** (`src/modules/reporting`) | • Store summary dashboard: total revenue, order counts, customer counts, low stock alerts.<br>• Top selling products grouped by SKU and revenue.<br>• Paginated system audit log viewer. | • **Financial Accuracy**: Revenue derives strictly from verified completed payments (`paymentStatus: COMPLETED`).<br>• Available stock accurately subtracts active reservations.<br>• Restricted strictly to `ADMIN` and `MANAGER` roles. |
| **13. Settings & Configuration** (`src/modules/settings`) | • Store profile settings: name, currency, contact email, phone, tax rate, low stock threshold.<br>• Public settings endpoint for storefront configuration. | • Public `GET /api/settings` filtered through strict whitelist.<br>• `POST /api/settings` validated against Zod schema rejecting credential/secret overrides. |

---

## 4. Payment & Webhook Processing Flow

The Razorpay integration guarantees that no client or browser can manipulate payment state:

```mermaid
sequenceDiagram
    autonumber
    actor Customer as Customer / Browser
    participant API as Store Backend (Express)
    participant DB as Shop Database (Prisma)
    participant RZP as Razorpay Gateway

    Customer->>API: POST /api/orders/checkout
    Note over API: Recalculate variant prices from DB<br/>Reserve stock atomically with version check
    API->>DB: Create Order (Status: PENDING, PaymentStatus: PENDING)
    API-->>Customer: Order Created (orderId, orderNumber, totalAmount)

    Customer->>API: POST /api/payments/create-order { orderId }
    API->>DB: Fetch order total and verify customer ownership
    Note over API: Convert total INR to integer paise (Math.round(total * 100))
    API->>RZP: orders.create({ amount: paise, currency: "INR", receipt: orderId })
    RZP-->>API: Razorpay Order (id: rzp_order_xxx)
    API->>DB: Store razorpayOrderId on Order record
    API-->>Customer: Return { keyId, razorpayOrderId, amount, currency }

    Customer->>RZP: Launch Razorpay Checkout Modal
    Customer->>RZP: Submit payment credentials
    RZP-->>Customer: Payment Response { razorpay_payment_id, razorpay_signature }

    Customer->>API: POST /api/payments/verify { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature }
    Note over API: 1. Verify HMAC-SHA256 signature using RAZORPAY_KEY_SECRET & timingSafeEqual<br/>2. Fetch payment state from Razorpay API: payments.fetch(paymentId)<br/>3. Verify payment status is 'captured' and amount matches order
    API->>DB: Atomic Transaction:<br/>- Update PaymentTransaction to COMPLETED<br/>- Transition Order to PAID
    API-->>Customer: Payment Verified { success: true }

    Note over RZP,API: Asynchronous Webhook Notification (Independent Verification)
    RZP->>API: POST /api/payments/webhook [Header: X-Razorpay-Signature]
    Note over API: Verify HMAC-SHA256 using raw body buffer & RAZORPAY_WEBHOOK_SECRET
    alt Signature Valid & Event = payment.captured
        API->>DB: Check if order already PAID (Idempotency Check)
        alt Already Processed
            API-->>RZP: 200 OK { received: true, duplicate: true }
        else First Time
            API->>DB: Mark Payment COMPLETED & Order PAID
            API-->>RZP: 200 OK { received: true }
        end
    else Invalid Signature
        API-->>RZP: 400 Bad Request { error: "Invalid signature" }
    end
```

---

## 5. Concurrency, Inventory Reservation & Checkout Architecture

To prevent overselling when multiple customers check out limited stock simultaneously, the application utilizes **Optimistic Concurrency Control (OCC)**:

```mermaid
sequenceDiagram
    autonumber
    actor CustomerA as Customer A (Cart: 2 units)
    actor CustomerB as Customer B (Cart: 2 units)
    participant InventoryService as Inventory Service
    participant DB as Shop Database (InventoryItem)

    Note over DB: Product Variant X: Stock = 2, Reserved = 0, Version = 1

    CustomerA->>InventoryService: reserveStock(Variant X, qty: 2)
    CustomerB->>InventoryService: reserveStock(Variant X, qty: 2)

    InventoryService->>DB: Tx A: Find InventoryItem (Stock: 2, Reserved: 0, Version: 1)
    InventoryService->>DB: Tx B: Find InventoryItem (Stock: 2, Reserved: 0, Version: 1)

    Note over InventoryService: Both see available stock = 2 - 0 = 2 >= 2

    InventoryService->>DB: Tx A: UPDATE InventoryItem SET reservedQuantity = 2, version = 2 WHERE id = X AND version = 1
    DB-->>InventoryService: Tx A Update Success (Count: 1)
    Note over DB: Variant X: Stock = 2, Reserved = 2, Version = 2

    InventoryService->>DB: Tx B: UPDATE InventoryItem SET reservedQuantity = 2, version = 2 WHERE id = X AND version = 1
    DB-->>InventoryService: Tx B Update Failed (Count: 0, Version mismatch!)

    Note over InventoryService: Tx B triggers backoff retry
    InventoryService->>DB: Tx B Retry: Find InventoryItem (Stock: 2, Reserved: 2, Version: 2)
    Note over InventoryService: Available stock = 2 - 2 = 0 < 2!
    InventoryService-->>CustomerB: 409 Conflict: "Insufficient stock available"
    InventoryService-->>CustomerA: Stock Reserved Successfully
```

---

## 6. Database Entity Relationship Diagram (ERD)

The Prisma schema defines 17 relational entities enforcing domain constraints:

```mermaid
erDiagram
    User ||--o{ Session : "maintains"
    User ||--o{ Address : "owns"
    User ||--o{ Order : "places"
    User ||--o{ Review : "writes"
    User ||--o{ AuditLog : "triggers"
    User ||--o| Cart : "owns"

    Category ||--o{ Category : "parent/child"
    Category ||--o{ Product : "classifies"

    Product ||--o{ ProductVariant : "offers"
    Product ||--o{ Review : "receives"

    ProductVariant ||--o| InventoryItem : "tracks"
    ProductVariant ||--o{ CartItem : "selected_in"
    ProductVariant ||--o{ OrderItem : "ordered_in"

    Cart ||--o{ CartItem : "contains"

    Order ||--o{ OrderItem : "contains"
    Order ||--o| Invoice : "generates"
    Order ||--o{ PaymentTransaction : "settled_via"
    Order }o--|| Address : "delivered_to"
    Order }o--o| DeliveryZone : "zoned_in"

    Coupon ||--o{ Order : "applied_to"

    User {
        string id PK
        string email UK
        string passwordHash
        string name
        enum role "ADMIN, MANAGER, STAFF, DELIVERY, CUSTOMER"
        boolean isActive
        string resetToken
        datetime resetTokenExpiry
    }

    Session {
        string id PK
        string userId FK
        string token UK
        datetime expiresAt
        datetime revokedAt
    }

    Product {
        string id PK
        string name
        string slug UK
        string sku UK
        float basePrice
        boolean isActive
        string categoryId FK
    }

    ProductVariant {
        string id PK
        string productId FK
        string name
        string sku UK
        float price
        int version
    }

    InventoryItem {
        string id PK
        string variantId FK
        int stockQuantity
        int reservedQuantity
        int lowStockThreshold
        int version
    }

    Cart {
        string id PK
        string customerId FK
        string sessionId UK
        string couponCode
    }

    Order {
        string id PK
        string orderNumber UK
        string customerId FK
        enum status "PENDING, PAID, PROCESSING, DISPATCHED, DELIVERED, CANCELLED, REFUNDED"
        enum paymentStatus "PENDING, COMPLETED, FAILED, REFUNDED"
        enum paymentMethod "CASH_ON_DELIVERY, ONLINE_RAZORPAY, MOCK_GATEWAY"
        string razorpayOrderId
        float subtotal
        float taxAmount
        float deliveryFee
        float discountAmount
        float totalAmount
        string guestAccessToken
    }

    Invoice {
        string id PK
        string invoiceNumber UK
        string orderId FK
        float totalAmount
    }
```

---

## 7. Security Architecture & Threat Defense Mapping

The application implements defense-in-depth across the entire request lifecycle:

```mermaid
flowchart LR
    subgraph Layer1["1. Network & Ingress"]
        H1["Helmet CSP (Razorpay whitelisted)"]
        H2["X-Content-Type-Options: nosniff"]
        H3["HSTS & X-Frame-Options: DENY"]
        H4["CORS Origin Whitelisting"]
    end

    subgraph Layer2["2. Rate Limiting"]
        R1["Auth Limiter (30 req / 15m)"]
        R2["Password Reset Limiter (5 req / 15m)"]
        R3["Payment Limiter (50 req / 15m)"]
        R4["API Limiter (120 req / 1m)"]
    end

    subgraph Layer3["3. Authentication & RBAC"]
        A1["JWT HS256 Token Verification"]
        A2["Session Revocation Check"]
        A3["Casbin RBAC Policy Enforcer"]
        A4["Single-Use SHA-256 Reset Tokens"]
    end

    subgraph Layer4["4. Validation & Sanitization"]
        V1["Zod Request Body & Query Schemas"]
        V2["escapeHtml() Template Sanitizer"]
        V3["Disallowed SVG MIME Type Filter"]
        V4["Settings Key Whitelist"]
    end

    subgraph Layer5["5. Business & Data Layer"]
        D1["Ownership Scoping (Cart & Orders)"]
        D2["Authoritative Server Price Math"]
        D3["Optimistic Locking Version Guards"]
        D4["Atomic DB Transactions (Prisma)"]
    end

    Layer1 --> Layer2 --> Layer3 --> Layer4 --> Layer5
```

---

## 8. Deployment Architecture & Operations

### Single-Shop Production Topology

Each client shop runs an isolated deployment:

```mermaid
flowchart TD
    Internet((Public Internet)) --> DNS["Shop DNS (e.g., store.algions.com)"]
    DNS --> ReverseProxy["Ingress Proxy (Cloudflare / Nginx / ALB)"]

    subgraph ShopInstance["Isolated Shop Deployment Container / Host"]
        App["Node.js Express App (algions-ecommerce-platform)"]
        LocalDisk["Uploads Volume (/public/uploads)"]
    end

    subgraph ManagedDB["Dedicated Database Instance"]
        Postgres[("PostgreSQL Database (One per shop)")]
    end

    subgraph CloudServices["External Managed Services"]
        Razorpay["Razorpay Gateway (Shop Merchant Account)"]
        Mailtrap["SMTP Email Provider"]
    end

    ReverseProxy -->|HTTPS| App
    App --> LocalDisk
    App -->|TCP Connection Pool| Postgres
    App -->|HTTPS API| Razorpay
    App -->|TLS| Mailtrap
```

### Operational Checklist for Pre-Production & Staging

1. **Environment Setup**:
   - Set `NODE_ENV=production`.
   - Configure 32-character random cryptographic secrets for `JWT_SECRET`, `REFRESH_SECRET`, and `COOKIE_SECRET`.
   - Set live merchant credentials in `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET`.
2. **PostgreSQL Configuration**:
   - Update `provider = "postgresql"` in `prisma/schema.prisma`.
   - Set `DATABASE_URL="postgresql://user:pass@host:5432/shop_db?schema=public"`.
   - Run `npx prisma migrate deploy`.
3. **Reverse Proxy Trust**:
   - Set `app.set('trust proxy', 1)` in `src/app.ts` if deployed behind an ingress load balancer so rate limiters inspect actual client IPs.
4. **Webhook Registration**:
   - Register `https://<shop-domain>/api/payments/webhook` in the live Razorpay Dashboard subscribing to `payment.captured`, `payment.failed`, and `order.paid`.
5. **Continuous Verification**:
   - Dependabot is configured in `.github/dependabot.yml` for automated dependency vulnerability management.
   - GitHub Actions CI in `.github/workflows/ci.yml` validates schema, tests, and builds on every change.
