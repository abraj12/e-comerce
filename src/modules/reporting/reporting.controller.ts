import { Request, Response } from 'express';
import { reportingService } from './reporting.service.js';

export class ReportingController {
  async getDashboard(_req: Request, res: Response): Promise<void> {
    try {
      const summary = await reportingService.getDashboardSummary();
      res.json({ success: true, data: summary });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }

  async getTopProducts(req: Request, res: Response): Promise<void> {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
      const products = await reportingService.getTopSellingProducts(limit);
      res.json({ success: true, data: products });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }

  async getAuditLogs(req: Request, res: Response): Promise<void> {
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const result = await reportingService.getAuditLogs(page, limit);
      res.json({ success: true, ...result });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
}

export const reportingController = new ReportingController();
