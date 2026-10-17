import { Request, Response } from 'express';
import { invoiceService } from './invoice.service.js';

export class InvoiceController {
  async getInvoice(req: Request, res: Response): Promise<void> {
    try {
      const invoice = await invoiceService.getInvoiceByOrderId(req.params.orderId as string, req.user);
      res.json({ success: true, data: invoice });
    } catch (error) {
      const msg = (error as Error).message;
      const status = msg.includes('Forbidden') ? 403 : 404;
      res.status(status).json({ success: false, error: msg });
    }
  }

  async renderHtmlInvoice(req: Request, res: Response): Promise<void> {
    try {
      const invoice = await invoiceService.getInvoiceByOrderId(req.params.orderId as string, req.user);
      const html = invoiceService.generateHtmlInvoice(invoice);
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (error) {
      const msg = (error as Error).message;
      const status = msg.includes('Forbidden') ? 403 : 404;
      res.status(status).send(`<h3>Error: ${msg}</h3>`);
    }
  }
}

export const invoiceController = new InvoiceController();
