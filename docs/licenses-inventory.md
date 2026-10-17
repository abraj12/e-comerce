# Open-Source Dependency and License Inventory
**ALGIONS AI LABS PRIVATE LIMITED**  
**Project:** Secure, Reusable, Component-Based E-commerce Platform  
**Compliance Review Date:** October 2026  

---

## 1. Production Dependencies

| Package Name | Exact Version | Repository / Package URL | License | Intended Commercial Use | Required Attribution / Notices | Known Limitations / Caveats | Security & Vulnerability Status | Modifications Made |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`@prisma/client`** | `6.4.1` | `https://github.com/prisma/prisma` | **Apache-2.0** | Object-Relational Mapping (ORM), migrations, and parameterized query execution. | Include Apache 2.0 license notice and copyright. | Requires running `prisma generate` after schema edits. | Verified safe in production; binary engines isolated. | None. Used as installed npm package. |
| **`zod`** | `4.6.7` | `https://github.com/colinhacks/zod` | **MIT** | Runtime schema validation for API request bodies, queries, URL parameters, and environment configs. | Include standard MIT copyright notice. | Must define key-value schemas explicitly for record types. | Zero known vulnerabilities. | None. Used as installed npm package. |
| **`casbin`** | `5.51.1` | `https://github.com/apache/casbin-node-casbin` | **Apache-2.0** | Server-side authorization and RBAC (Role-Based Access Control) policy enforcement. | Include Apache 2.0 notice. | In-memory string adapter used for local rules; can be backed by DB adapter. | Safe; 100% open-source without enterprise paywalls. | None. Used as installed npm package. |
| **`express`** | `5.3.0` | `https://github.com/expressjs/express` | **MIT** | HTTP server routing, middleware composition, request parsing, and error handling. | Include standard MIT notice. | In Express 5, `req.query` and `req.params` are getters on IncomingMessage. | Active LTS maintenance; battle-tested web framework. | None. Used as installed npm package. |
| **`helmet`** | `8.3.0` | `https://github.com/helmetjs/helmet` | **MIT** | HTTP response security headers (CSP, X-Frame-Options, HSTS, X-Content-Type-Options). | Include standard MIT notice. | CSP directives must allow required CDN assets if external scripts are loaded. | Zero known vulnerabilities. | Configured custom CSP directives. |
| **`cors`** | `2.8.6` | `https://github.com/expressjs/cors` | **MIT** | Cross-Origin Resource Sharing control. | Include standard MIT notice. | Wildcard origin should not be combined with credentials in strict environments. | Zero known vulnerabilities. | None. |
| **`bcryptjs`** | `3.0.3` | `https://github.com/dcodeIO/bcrypt.js` | **MIT** | Secure password hashing with salt (work factor 12). | Include standard MIT notice. | Pure JS implementation; slightly slower than native C bindings under high concurrency. | Zero known vulnerabilities. | None. |
| **`jsonwebtoken`** | `9.0.3` | `https://github.com/auth0/node-jsonwebtoken` | **MIT** | Access token generation and cryptographic HMAC-SHA256 signature verification. | Include standard MIT notice. | Secret keys must have at least 256 bits of entropy. | Strict algorithm enforcement (`HS256`) configured. | None. |
| **`nodemailer`** | `10.1.2` | `https://github.com/nodemailer/nodemailer` | **MIT-0** | Transactional email delivery for order receipts, customer confirmations, and low-stock alerts. | None required (Zero-clause MIT permissive license). | Requires valid SMTP credentials for live external email dispatch. | Zero vulnerabilities. Mock/local memory transport provided. | None. |
| **`multer`** | `2.4.0` | `https://github.com/expressjs/multer` | **MIT** | Multipart/form-data handler for secure product image uploads. | Include standard MIT notice. | Must strictly whitelist MIME types and restrict file sizes to prevent disk exhaustion. | MIME inspection & 5MB file limit enforced. | None. |
| **`cookie-parser`**| `1.4.7` | `https://github.com/expressjs/cookie-parser` | **MIT** | Signed cookie extraction for customer shopping cart sessions. | Include standard MIT notice. | Cookie secret required for signing. | Zero vulnerabilities. | None. |
| **`express-rate-limit`**| `8.7.1` | `https://github.com/express-rate-limit/express-rate-limit` | **MIT** | Sliding-window IP rate limiter against brute-force credential attacks. | Include standard MIT notice. | Behind reverse proxies (e.g. Nginx, Cloudflare), `trust proxy` must be configured. | Zero vulnerabilities. | None. |
| **`dotenv`** | `18.0.8` | `https://github.com/motdotla/dotenv` | **MIT** | Environment variable management from `.env` files. | Include standard MIT notice. | `.env` files must never be committed to git repositories. | Zero vulnerabilities. | None. |
| **`uuid`** | `14.0.3` | `https://github.com/uuidjs/uuid` | **MIT** | Cryptographically secure UUIDv4 generation for sessions and records. | Include standard MIT notice. | None. | Zero vulnerabilities. | None. |

---

## 2. Development & Quality Assurance Dependencies

| Package Name | Exact Version | Repository / URL | License | Intended Use |
| :--- | :--- | :--- | :--- | :--- |
| **`typescript`** | `6.0.3` | `https://github.com/microsoft/TypeScript` | **Apache-2.0** | Static type checking and compiler. |
| **`tsx`** | `4.23.15` | `https://github.com/privatenumber/tsx` | **MIT** | Zero-config TypeScript runner and test execution engine. |
| **`prisma`** (CLI) | `6.4.1` | `https://github.com/prisma/prisma` | **Apache-2.0** | Database migrations and client generator CLI. |
| **`supertest`** | `7.3.1` | `https://github.com/ladjs/supertest` | **MIT** | HTTP integration testing against Express endpoints. |

---

## 3. Commercial Licensing Audit Summary
1. **Commercial Compatibility**: Every production dependency is licensed under **MIT**, **MIT-0**, or **Apache-2.0**. None carry Copyleft (GPL, AGPL) or non-commercial restrictions.
2. **Proprietary Avoidance**: We explicitly adopted **Node-Casbin (Apache 2.0)** instead of Medusa's enterprise-licensed RBAC module, ensuring zero commercial licensing fees or vendor lock-in for ALGIONS client projects.
3. **No Unlicensed Code**: All components are official, maintained packages from the npm registry with verifiable sources.
