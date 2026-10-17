import { Request, Response } from 'express';
import { inventoryService } from './inventory.service.js';

export class InventoryController {
  async adjustStock(req: Request, res: Response): Promise<void> {
    try {
      const result = await inventoryService.adjustStock({
        variantId: req.body.variantId,
        quantityChange: req.body.quantityChange,
        reason: req.body.reason,
        referenceId: req.body.referenceId,
        performedBy: req.user?.userId
      });
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(400).json({ success: false, error: (error as Error).message });
    }
  }

  async getLowStock(_req: Request, res: Response): Promise<void> {
    try {
      const items = await inventoryService.getLowStockItems();
      res.json({ success: true, data: items });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }

  async getLogs(req: Request, res: Response): Promise<void> {
    try {
      const logs = await inventoryService.getInventoryLogs(
        req.query.variantId as string | undefined,
        req.query.limit ? parseInt(req.query.limit as string, 10) : 50
      );
      res.json({ success: true, data: logs });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
}

export const inventoryController = new InventoryController();
