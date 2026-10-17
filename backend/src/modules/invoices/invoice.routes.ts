import { Router } from 'express';
import { invoiceController } from './invoice.controller.js';
import { optionalAuthenticate } from '../../core/authentication/middleware.js';

export const invoiceRouter = Router();

invoiceRouter.use(optionalAuthenticate);

invoiceRouter.get('/:orderId', invoiceController.getInvoice);
invoiceRouter.get('/:orderId/render', invoiceController.renderHtmlInvoice);
