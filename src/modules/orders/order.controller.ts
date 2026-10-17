import { Request, Response } from 'express';
import { orderService } from './order.service.js';
import { OrderStatus } from '@prisma/client';

export class OrderController {
  async create(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = (req.headers['x-session-id'] as string) || req.cookies?.cart_session;
      const order = await orderService.createOrderFromCart({
        ...req.body,
        customerId: req.user?.userId,
        sessionId
      });
      res.status(201).json({ success: true, data: order });
    } catch (error) {
      res.status(400).json({ success: false, error: (error as Error).message });
    }
  }

  async list(req: Request, res: Response): Promise<void> {
    try {
      const isStaffOrAdmin = req.user && req.user.role !== 'CUSTOMER';
      const filters = {
        customerId: isStaffOrAdmin ? (req.query.customerId as string) : req.user?.userId,
        status: req.query.status as OrderStatus | undefined,
        page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20
      };

      const result = await orderService.listOrders(filters);
      res.json({ success: true, ...result });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }

  async getById(req: Request, res: Response): Promise<void> {
    try {
      const guestToken = (req.query.token as string) || (req.headers['x-order-token'] as string);
      const order = await orderService.getOrderById(req.params.id as string, req.user, guestToken);
      res.json({ success: true, data: order });
    } catch (error) {
      const msg = (error as Error).message;
      const status = msg.includes('Forbidden') ? 403 : msg.includes('Unauthorized') ? 401 : 404;
      res.status(status).json({ success: false, error: msg });
    }
  }

  async track(req: Request, res: Response): Promise<void> {
    try {
      const tracking = await orderService.trackOrderPublic(req.params.orderNumber as string);
      res.json({ success: true, data: tracking });
    } catch (error) {
      res.status(404).json({ success: false, error: (error as Error).message });
    }
  }

  async updateStatus(req: Request, res: Response): Promise<void> {
    try {
      const order = await orderService.updateOrderStatus(
        req.params.id as string,
        req.body.status as OrderStatus,
        req.body.reason,
        req.user?.userId
      );
      res.json({ success: true, data: order });
    } catch (error) {
      res.status(400).json({ success: false, error: (error as Error).message });
    }
  }
}

export const orderController = new OrderController();
