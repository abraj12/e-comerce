import { Router, Request, Response } from 'express';
import { prisma } from '../../core/database/prisma.js';
import { env } from '../../core/config/env.js';
import { authenticate } from '../../core/authentication/middleware.js';
import { authorize } from '../../core/authorization/guard.js';
import { validate } from '../../core/validation/validator.js';
import { z } from 'zod';

export const settingsRouter = Router();

// Whitelist of safe public setting keys that can be exposed to anonymous clients
const PUBLIC_ALLOWED_SETTINGS = new Set([
  'storeName',
  'currency',
  'email',
  'phone',
  'taxRate',
  'announcementBanner',
  'socialLinks',
  'storeAddress',
  'businessHours'
]);

const updateSettingSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(100)
    .refine(
      (k) =>
        !k.toLowerCase().includes('secret') &&
        !k.toLowerCase().includes('password') &&
        !k.toLowerCase().includes('token') &&
        !k.toLowerCase().includes('key'),
      {
        message: 'Sensitive credentials or secrets cannot be stored in store settings'
      }
    ),
  value: z.string().max(2000),
  description: z.string().max(500).optional()
});

// Public: Get store branding and public profile (filters out any sensitive keys)
settingsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const settings = await prisma.storeSetting.findMany();
    const configMap: Record<string, string> = {
      storeName: env.STORE_NAME,
      currency: env.STORE_CURRENCY,
      email: env.STORE_EMAIL,
      phone: env.STORE_PHONE,
      taxRate: String(env.TAX_RATE_PERCENTAGE)
    };

    settings.forEach((s) => {
      if (PUBLIC_ALLOWED_SETTINGS.has(s.key)) {
        configMap[s.key] = s.value;
      }
    });

    res.json({ success: true, data: configMap });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Protected: Update store settings (Admin only with strict input validation)
settingsRouter.post(
  '/',
  authenticate,
  authorize('ADMIN', 'write'),
  validate({ body: updateSettingSchema }),
  async (req: Request, res: Response) => {
    try {
      const { key, value, description } = req.body;
      const setting = await prisma.storeSetting.upsert({
        where: { key },
        update: { value, description },
        create: { key, value, description }
      });
      res.json({ success: true, data: setting });
    } catch (error) {
      res.status(400).json({ success: false, error: (error as Error).message });
    }
  }
);
