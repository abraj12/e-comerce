# Reusable Components Catalog & Architecture Reference
**ALGIONS AI LABS PRIVATE LIMITED**  
**Project:** Secure, Reusable, Component-Based E-commerce Platform  

This catalog provides engineers with a reference for selecting, integrating, and customizing individual components for future client deployments (clothing stores, sweet shops, grocery marts, electronics shops).

---

## 1. Architectural Classification

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Storefront & Admin Web UI                       │
└───────────────────────────────────▲────────────────────────────────────┘
                                    │ HTTP / REST APIs
┌───────────────────────────────────▼────────────────────────────────────┐
│                    Reusable E-Commerce Modules                         │
│  [Products]  [Categories]  [Inventory]  [Cart]  [Promotions]  [Orders] │
│  [Delivery]  [Payments]    [Invoices]   [Reporting]  [Reviews]         │
└───────────────────────────────────▲────────────────────────────────────┘
                                    │ Internal Component Calls
┌───────────────────────────────────▼────────────────────────────────────┐
│                     Cross-Cutting Core Services                        │
│  [Zod Validation]  [Casbin RBAC]  [Argon2/Bcrypt Tokens]  [Audit Logs] │
│  [Prisma ORM]      [Event Bus]    [Secure Storage]        [Rate Limit] │
└───────────────────────────────────▲────────────────────────────────────┘
                                    │ Adapters
┌───────────────────────────────────▼────────────────────────────────────┐
│                       Integrations Layer                               │
│  [Stripe & HMAC Webhook Engine]      [Nodemailer SMTP Adapter]         │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Foundational Components

### `core/authentication`
- **Location**: `src/core/authentication/`
- **Responsibilities**: Password hashing with bcrypt/salt (work factor 12), JWT access token issuing (2h), session rotation with cryptographic refresh tokens (7d), user identity resolution, and sliding-window rate limiting.
- **Dependencies**: `jsonwebtoken`, `bcryptjs`, `express-rate-limit`, `uuid`.
- **Reusable Interfaces**:
  - `hashPassword(password: string): Promise<string>`
  - `verifyPassword(password: string, hash: string): Promise<boolean>`
  - `generateAccessToken(user): string`
  - `validateAndRotateSession(refreshToken): Promise<{ userId, newRefreshToken } | null>`
  - `authenticate` & `optionalAuthenticate` Express middlewares.
- **Customization for New Clients**: Change token TTL, cookie domains, or plug in OAuth / Better-Auth SSO adapters.

### `core/authorization`
- **Location**: `src/core/authorization/`
- **Responsibilities**: Declarative policy-based Role-Based Access Control (RBAC) powered by **Node-Casbin (Apache-2.0)**. Enforces deny-by-default access control on all administrative operations.
- **Dependencies**: `casbin`.
- **Reusable Interfaces**:
  - `checkPermission(role: string, resource: string, action: string): Promise<boolean>`
  - `authorize(resource: string, action: string)` Express route guard middleware.
- **Default Roles**: `ADMIN`, `MANAGER`, `STAFF`, `DELIVERY`, `CUSTOMER`.
- **Customization for New Clients**: Add new permissions or roles (e.g. `PHARMACIST` for medical shop, `TAILOR` for clothing shop) simply by adding policy lines to the Casbin policy definition.

### `core/validation`
- **Location**: `src/core/validation/`
- **Responsibilities**: Strict schema boundary validation using **Zod (MIT)**. Strips undeclared fields, verifies string lengths, email formats, numerical bounds, and regex patterns for `body`, `query`, and `params`.
- **Dependencies**: `zod`.
- **Reusable Interfaces**:
  - `validate({ body?: ZodSchema, query?: ZodSchema, params?: ZodSchema })`

### `core/logging` & `core/audit`
- **Location**: `src/core/logging/`
- **Responsibilities**: Structured JSON logging with ISO timestamps and error code extraction. Database audit trail logging every security event, login attempt, stock modification, and payment confirmation.
- **Dependencies**: `@prisma/client`.
- **Reusable Interfaces**:
  - `logger.info(message, context?)`, `logger.error(message, error, context?)`
  - `recordAuditEvent(event: AuditEvent): Promise<void>`

### `core/events`
- **Location**: `src/core/events/`
- **Responsibilities**: Decoupled asynchronous event bus enabling independent module reactions (e.g., triggering order confirmation email upon order placement, or triggering restock warnings upon inventory deduction).
- **Reusable Interfaces**:
  - `eventBus.publish(eventName, payload)`
  - `eventBus.subscribe(eventName, handler)`

---

## 3. Commerce Business Modules

| Module | Key Operations | Concurrency & Security Features |
| :--- | :--- | :--- |
| **Products** (`modules/products`) | Product CRUD, image uploads, variants (size, color, weight), master SKU, slug generation, category assignment, multi-filter search. | Parameterized queries, image MIME verification, sanitized filenames. |
| **Categories** (`modules/categories`) | Category trees, subcategories, automated slug generation, active/inactive toggles. | Unique slug enforcement, cascade checks. |
| **Inventory** (`modules/inventory`) | Stock adjustments, atomic reservations (`reserveStock`), stock commits (`commitReservation`), reservation rollbacks, low-stock threshold queries, inventory movement log. | **Atomic database transactions** (`$transaction`) and conditional row-level increments preventing overselling under concurrent traffic. |
| **Cart** (`modules/cart`) | Customer & guest session shopping carts, add items with real-time stock availability check, quantity adjustments, coupon application, dynamic tax and subtotal computation. | Stock checks at item-add and update stages; cookie session isolation. |
| **Promotions** (`modules/promotions`) | Percentage and fixed amount coupons, minimum order amount thresholds, maximum discount caps, usage limit counters, expiry date enforcement. | Atomic usage counter increments; server-side discount re-computation at checkout. |
| **Delivery** (`modules/delivery`) | Delivery service zones, comma-separated PIN code matcher, delivery charge computation, free delivery threshold qualification, delivery staff dispatch assignment, status transitions. | Input sanitization, staff role validation (`DELIVERY` role only). |
| **Orders** (`modules/orders`) | Order placement state machine (`PENDING` → `PAID` → `PROCESSING` → `DISPATCHED` → `DELIVERED`), atomic checkout with stock reservation, address capture, customer order tracking. | **IDOR prevention** (Customers can only view their own orders); automatic stock release on cancellation. |
| **Payments** (`modules/payments`) | Cash on delivery processing, Stripe payment intent creation, signed webhook handler with HMAC-SHA256 signature verification and replay defense (timestamp window check), mock payment simulator for automated tests. | Timing-safe signature comparison (`crypto.timingSafeEqual`); idempotency key tracking to avoid double charges. |
| **Invoices** (`modules/invoices`) | Structured tax invoice data generation, breakdown of items, subtotal, discount, GST/tax, delivery charges, and printable HTML tax invoice rendering. | Access control validation; HTML escaping. |
| **Reporting** (`modules/reporting`) | Sales analytics, revenue totals, order status distribution, best-selling product rankings, low stock item lists, system audit log query. | RBAC-restricted to Manager and Admin roles only. |
| **Reviews** (`modules/reviews`) | Customer reviews and 1-5 star ratings, average rating calculation on product catalogue, staff moderation. | Authentication required; input sanitization. |

---

## 4. Reusability Guide by Client Vertical

### A. Grocery & Supermarket Clients
- **Modules to select**: `products`, `categories`, `inventory`, `cart`, `promotions`, `delivery` (Local PIN codes), `orders`, `invoices`.
- **Recommended variant options**: Weight / Pack Size (e.g. `500g`, `1kg`, `5kg`).
- **Configuration**: Set delivery windows to `2-4 hours`, configure free delivery threshold (e.g. ₹500).

### B. Traditional Sweet & Snack Shops
- **Modules to select**: `products`, `categories`, `inventory`, `cart`, `promotions`, `delivery`, `orders`, `invoices`, `reviews`.
- **Recommended variant options**: Box size (`250g Gift Box`, `500g Festive Box`, `1kg Family Pack`).
- **Configuration**: Set low-stock threshold higher (e.g. 10 boxes) due to fast perishable turnover.

### C. Clothing & Apparel Boutiques
- **Modules to select**: `products`, `categories`, `inventory`, `cart`, `promotions`, `orders`, `invoices`, `reviews`.
- **Recommended variant options**: `Size` (`S`, `M`, `L`, `XL`, `XXL`) and `Color` (`Navy`, `Olive`, `Black`).
- **Configuration**: Add multiple warehouse locations (`location = 'WAREHOUSE_B'`).

### D. Electronics & Accessories Shops
- **Modules to select**: `products`, `categories`, `inventory`, `cart`, `orders`, `payments` (Stripe / Online card processing), `invoices`, `reporting`.
- **Recommended variant options**: `Color` (`Space Gray`, `Silver`), `Storage` (`128GB`, `256GB`), `Warranty` (`1 Year`, `2 Year`).
