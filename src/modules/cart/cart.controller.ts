import { Request, Response } from 'express';
import { cartService } from './cart.service.js';
import { v4 as uuidv4 } from 'uuid';

function getSessionId(req: Request, res: Response): string {
  let sessionId = (req.headers['x-session-id'] as string) || req.cookies?.cart_session;
  if (!sessionId) {
    sessionId = uuidv4();
    res.cookie('cart_session', sessionId, {
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      sameSite: 'lax'
    });
  }
  return sessionId;
}

export class CartController {
  async getCart(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = getSessionId(req, res);
      const cart = await cartService.getCart(req.user?.userId, sessionId);
      res.json({ success: true, data: cart });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }

  async addItem(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = getSessionId(req, res);
      const cart = await cartService.addItem(
        req.body.variantId,
        req.body.quantity,
        req.user?.userId,
        sessionId
      );
      res.json({ success: true, data: cart });
    } catch (error) {
      res.status(400).json({ success: false, error: (error as Error).message });
    }
  }

  async updateItem(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = getSessionId(req, res);
      const cart = await cartService.updateItemQuantity(
        req.params.itemId as string,
        req.body.quantity,
        req.user?.userId,
        sessionId
      );
      res.json({ success: true, data: cart });
    } catch (error) {
      res.status(400).json({ success: false, error: (error as Error).message });
    }
  }

  async removeItem(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = getSessionId(req, res);
      const cart = await cartService.removeItem(req.params.itemId as string, req.user?.userId, sessionId);
      res.json({ success: true, data: cart });
    } catch (error) {
      res.status(400).json({ success: false, error: (error as Error).message });
    }
  }

  async applyCoupon(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = getSessionId(req, res);
      const cart = await cartService.applyCoupon(req.body.couponCode, req.user?.userId, sessionId);
      res.json({ success: true, data: cart });
    } catch (error) {
      res.status(400).json({ success: false, error: (error as Error).message });
    }
  }

  async removeCoupon(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = getSessionId(req, res);
      const cart = await cartService.removeCoupon(req.user?.userId, sessionId);
      res.json({ success: true, data: cart });
    } catch (error) {
      res.status(400).json({ success: false, error: (error as Error).message });
    }
  }
}

export const cartController = new CartController();
