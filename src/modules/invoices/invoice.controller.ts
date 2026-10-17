import { Request, Response } from 'express';
import { invoiceService, escapeHtml } from './invoice.service.js';

export class InvoiceController {
  async getInvoice(req: Request, res: Response): Promise<void> {
    try {
      const guestToken = (req.query.token as string) || (req.headers['x-guest-token'] as string) || (req.headers['x-order-token'] as string);
      const invoice = await invoiceService.getInvoiceByOrderId(req.params.orderId as string, req.user, guestToken);
      res.json({ success: true, data: invoice });
    } catch (error) {
      const msg = (error as Error).message;
      const status = msg.includes('Forbidden') ? 403 : msg.includes('Unauthorized') ? 401 : 404;
      res.status(status).json({ success: false, error: msg });
    }
  }

  async renderHtmlInvoice(req: Request, res: Response): Promise<void> {
    try {
      const guestToken = (req.query.token as string) || (req.headers['x-guest-token'] as string) || (req.headers['x-order-token'] as string);
      const invoice = await invoiceService.getInvoiceByOrderId(req.params.orderId as string, req.user, guestToken);
      const html = invoiceService.generateHtmlInvoice(invoice);
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (error) {
      const msg = (error as Error).message;
      const status = msg.includes('Forbidden') ? 403 : msg.includes('Unauthorized') ? 401 : 404;
      res.status(status).send(`<h3>Error: ${escapeHtml(msg)}</h3>`);
    }
  }
}

export const invoiceController = new InvoiceController();
