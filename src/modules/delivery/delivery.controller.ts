import { Request, Response } from 'express';
import { deliveryService } from './delivery.service.js';
import { OrderStatus } from '@prisma/client';

export class DeliveryController {
  async listZones(_req: Request, res: Response): Promise<void> {
    try {
      const zones = await deliveryService.listZones();
      res.json({ success: true, data: zones });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }

  async checkAvailability(req: Request, res: Response): Promise<void> {
    try {
      const { pinCode, orderSubtotal } = req.query as { pinCode: string; orderSubtotal?: string };
      const result = await deliveryService.checkDeliveryAvailability(
        pinCode,
        orderSubtotal ? parseFloat(orderSubtotal) : 0
      );
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(400).json({ success: false, error: (error as Error).message });
    }
  }

  async createZone(req: Request, res: Response): Promise<void> {
    try {
      const zone = await deliveryService.createZone(req.body);
      res.status(201).json({ success: true, data: zone });
    } catch (error) {
      res.status(400).json({ success: false, error: (error as Error).message });
    }
  }

  async deleteZone(req: Request, res: Response): Promise<void> {
    try {
      await deliveryService.deleteZone(req.params.id as string);
      res.json({ success: true, message: 'Delivery zone deleted successfully' });
    } catch (error) {
      res.status(400).json({ success: false, error: (error as Error).message });
    }
  }

  async listStaff(_req: Request, res: Response): Promise<void> {
    try {
      const staff = await deliveryService.listDeliveryStaff();
      res.json({ success: true, data: staff });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }

  async assignStaff(req: Request, res: Response): Promise<void> {
    try {
      const order = await deliveryService.assignStaff(
        req.body.orderId,
        req.body.deliveryStaffId,
        req.user?.userId
      );
      res.json({ success: true, data: order });
    } catch (error) {
      res.status(400).json({ success: false, error: (error as Error).message });
    }
  }

  async updateStatus(req: Request, res: Response): Promise<void> {
    try {
      const order = await deliveryService.updateDeliveryStatus(
        req.params.orderId as string,
        req.body.status as OrderStatus,
        req.user?.userId
      );
      res.json({ success: true, data: order });
    } catch (error) {
      res.status(400).json({ success: false, error: (error as Error).message });
    }
  }
}

export const deliveryController = new DeliveryController();
