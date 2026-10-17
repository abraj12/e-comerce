import { Router, Request, Response } from 'express';
import { prisma } from '../../core/database/prisma.js';
import { env } from '../../core/config/env.js';
import { authenticate } from '../../core/authentication/middleware.js';
import { authorize } from '../../core/authorization/guard.js';

export const settingsRouter = Router();

// Public: Get store branding and public profile
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
      configMap[s.key] = s.value;
    });

    res.json({ success: true, data: configMap });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Protected: Update store settings (Admin only)
settingsRouter.post(
  '/',
  authenticate,
  authorize('ADMIN', 'write'),
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
