import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';

import { env } from './core/config/env.js';
import { logger } from './core/logging/logger.js';
import { checkDatabaseConnection } from './core/database/prisma.js';

import { authRouter } from './modules/auth/auth.routes.js';
import { categoryRouter } from './modules/categories/category.routes.js';
import { productRouter } from './modules/products/product.routes.js';
import { inventoryRouter } from './modules/inventory/inventory.routes.js';
import { cartRouter } from './modules/cart/cart.routes.js';
import { promotionRouter } from './modules/promotions/promotion.routes.js';
import { deliveryRouter } from './modules/delivery/delivery.routes.js';
import { orderRouter } from './modules/orders/order.routes.js';
import { paymentRouter } from './modules/payments/payment.routes.js';
import { invoiceRouter } from './modules/invoices/invoice.routes.js';
import { reportingRouter } from './modules/reporting/reporting.routes.js';
import { reviewRouter } from './modules/reviews/review.routes.js';
import { settingsRouter } from './modules/settings/settings.routes.js';

const projectRoot = process.cwd();

export const app = express();

// Security Headers via Helmet with relaxed script/style CSP for UI and Swagger
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://unpkg.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
        imgSrc: ["'self'", "data:", "https://images.unsplash.com", "https://unpkg.com"]
      }
    },
    crossOriginEmbedderPolicy: false
  })
);

app.use(cors());
app.use(cookieParser(env.COOKIE_SECRET));

// Parse JSON and capture raw buffer for webhook signature validation
app.use(
  express.json({
    verify: (req: Request, _res: Response, buf: Buffer) => {
      (req as any).rawBody = buf.toString('utf8');
    }
  })
);
app.use(express.urlencoded({ extended: true }));

// Serve static frontend and uploads
const publicDir = path.join(projectRoot, 'public');
app.use(express.static(publicDir));
app.use('/uploads', express.static(path.resolve(env.UPLOAD_DIR)));

// OpenAPI Spec & Documentation Viewer
app.get('/docs/openapi.json', (_req: Request, res: Response) => {
  const openApiPath = path.join(projectRoot, 'docs', 'openapi.json');
  if (fs.existsSync(openApiPath)) {
    res.sendFile(openApiPath);
  } else {
    res.status(404).json({ error: 'OpenAPI specification not found' });
  }
});

app.get('/api-docs', (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, 'docs', 'index.html'));
});

// Health check endpoint
app.get('/api/health', async (_req: Request, res: Response) => {
  const dbHealth = await checkDatabaseConnection();
  const uptimeSeconds = Math.floor(process.uptime());
  const memoryUsage = process.memoryUsage();

  const isHealthy = dbHealth.connected;
  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptimeSeconds,
    database: {
      status: dbHealth.connected ? 'connected' : 'disconnected',
      latencyMs: dbHealth.latencyMs
    },
    memory: {
      heapUsedMb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      rssMb: Math.round(memoryUsage.rss / 1024 / 1024)
    }
  });
});

// Mount modular API routers
app.use('/api/auth', authRouter);
app.use('/api/categories', categoryRouter);
app.use('/api/products', productRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/cart', cartRouter);
app.use('/api/promotions', promotionRouter);
app.use('/api/delivery', deliveryRouter);
app.use('/api/orders', orderRouter);
app.use('/api/payments', paymentRouter);
app.use('/api/invoices', invoiceRouter);
app.use('/api/reports', reportingRouter);
app.use('/api/reviews', reviewRouter);
app.use('/api/settings', settingsRouter);

// 404 handler for unmatched API routes
app.use('/api', (_req: Request, res: Response) => {
  res.status(404).json({ success: false, error: 'API endpoint not found' });
});

// Global error handling middleware (safe, leak-free error response)
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error(`Unhandled error processing ${req.method} ${req.url}`, err, {
    url: req.url,
    method: req.method,
    ip: req.ip
  });

  const statusCode = (err as any).statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error: env.NODE_ENV === 'production' ? 'An internal server error occurred' : err.message
  });
});
