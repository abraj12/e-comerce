import { Request, Response } from 'express';
import { promotionService } from './promotion.service.js';

export class PromotionController {
  async list(_req: Request, res: Response): Promise<void> {
    try {
      const coupons = await promotionService.listCoupons();
      res.json({ success: true, data: coupons });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }

  async validateCoupon(req: Request, res: Response): Promise<void> {
    try {
      const { code, subtotal } = req.query as { code: string; subtotal: string };
      const result = await promotionService.validateCoupon(code, parseFloat(subtotal));
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(400).json({ success: false, error: (error as Error).message });
    }
  }

  async create(req: Request, res: Response): Promise<void> {
    try {
      const coupon = await promotionService.createCoupon(req.body);
      res.status(201).json({ success: true, data: coupon });
    } catch (error) {
      res.status(400).json({ success: false, error: (error as Error).message });
    }
  }

  async delete(req: Request, res: Response): Promise<void> {
    try {
      await promotionService.deleteCoupon(req.params.id as string);
      res.json({ success: true, message: 'Coupon deleted successfully' });
    } catch (error) {
      res.status(400).json({ success: false, error: (error as Error).message });
    }
  }
}

export const promotionController = new PromotionController();
