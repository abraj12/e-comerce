import { prisma } from '../../core/database/prisma.js';
import { env } from '../../core/config/env.js';

export class InvoiceService {
  async getInvoiceByOrderId(orderId: string, requestingUser?: { userId: string; role: string }) {
    const invoice = await prisma.invoice.findFirst({
      where: {
        OR: [{ orderId }, { id: orderId }]
      },
      include: {
        order: {
          include: {
            items: true,
            shippingAddress: true,
            deliveryZone: true
          }
        }
      }
    });

    if (!invoice) {
      throw new Error(`Invoice for order ${orderId} not found`);
    }

    // Access control
    if (
      requestingUser &&
      requestingUser.role === 'CUSTOMER' &&
      invoice.order.customerId !== requestingUser.userId
    ) {
      throw new Error('Forbidden: You are not authorized to view this invoice');
    }

    return invoice;
  }

  generateHtmlInvoice(invoice: any): string {
    const { order } = invoice;
    const itemsRows = order.items
      .map(
        (i: any) => `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${i.productName} (${i.variantName})</td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">${i.sku}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">₹${i.unitPrice.toFixed(2)}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">${i.quantity}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">₹${i.totalPrice.toFixed(2)}</td>
        </tr>
      `
      )
      .join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Invoice #${invoice.invoiceNumber}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 40px; color: #2d3748; background-color: #fff; }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #3182ce; padding-bottom: 20px; margin-bottom: 30px; }
          .brand { font-size: 24px; font-weight: bold; color: #2b6cb0; }
          .invoice-details { text-align: right; }
          .info-grid { display: flex; justify-content: space-between; margin-bottom: 30px; }
          .table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          .table th { background: #edf2f7; padding: 12px 10px; text-align: left; font-size: 13px; text-transform: uppercase; color: #4a5568; }
          .summary { width: 320px; margin-left: auto; margin-bottom: 30px; }
          .summary-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #edf2f7; }
          .summary-total { font-size: 18px; font-weight: bold; color: #2b6cb0; border-top: 2px solid #2b6cb0; border-bottom: none; margin-top: 10px; }
          .footer { text-align: center; font-size: 12px; color: #a0aec0; margin-top: 50px; border-top: 1px solid #edf2f7; padding-top: 20px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="brand">${env.STORE_NAME}</div>
            <div style="font-size: 13px; color: #718096; margin-top: 4px;">Local Retail Store & Fulfillment</div>
            <div style="font-size: 13px; color: #718096;">Email: ${env.STORE_EMAIL} | Phone: ${env.STORE_PHONE}</div>
          </div>
          <div class="invoice-details">
            <h1 style="margin: 0; font-size: 26px; color: #2d3748;">TAX INVOICE</h1>
            <div style="margin-top: 8px; font-size: 14px;"><strong>Invoice #:</strong> ${invoice.invoiceNumber}</div>
            <div style="font-size: 14px;"><strong>Order #:</strong> ${order.orderNumber}</div>
            <div style="font-size: 14px;"><strong>Date:</strong> ${new Date(invoice.invoiceDate).toLocaleDateString()}</div>
          </div>
        </div>

        <div class="info-grid">
          <div>
            <h4 style="margin: 0 0 8px 0; color: #4a5568;">BILLED & DELIVERED TO:</h4>
            <div><strong>${order.shippingAddress?.recipientName || order.customerEmail}</strong></div>
            <div>${order.shippingAddress?.streetAddress || 'Store Pickup'}</div>
            <div>${order.shippingAddress ? `${order.shippingAddress.city}, ${order.shippingAddress.state} - ${order.shippingAddress.pinCode}` : ''}</div>
            <div>Phone: ${order.customerPhone}</div>
          </div>
          <div style="text-align: right;">
            <h4 style="margin: 0 0 8px 0; color: #4a5568;">PAYMENT & FULFILLMENT:</h4>
            <div>Payment Method: <strong>${order.paymentMethod}</strong></div>
            <div>Payment Status: <strong>${order.paymentStatus}</strong></div>
            <div>Delivery Mode: <strong>${order.deliveryType}</strong></div>
          </div>
        </div>

        <table class="table">
          <thead>
            <tr>
              <th>Item Description</th>
              <th style="text-align: center;">SKU</th>
              <th style="text-align: right;">Unit Price</th>
              <th style="text-align: center;">Qty</th>
              <th style="text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
        </table>

        <div class="summary">
          <div class="summary-row">
            <span>Subtotal:</span>
            <span>₹${invoice.subtotal.toFixed(2)}</span>
          </div>
          ${invoice.discountAmount > 0 ? `<div class="summary-row" style="color: #38a169;"><span>Discount (${order.couponCode || 'Promo'}):</span><span>-₹${invoice.discountAmount.toFixed(2)}</span></div>` : ''}
          <div class="summary-row">
            <span>GST / Tax (${env.TAX_RATE_PERCENTAGE}%):</span>
            <span>₹${invoice.taxAmount.toFixed(2)}</span>
          </div>
          <div class="summary-row">
            <span>Delivery Fee:</span>
            <span>${invoice.deliveryFee > 0 ? `₹${invoice.deliveryFee.toFixed(2)}` : 'FREE'}</span>
          </div>
          <div class="summary-row summary-total">
            <span>Grand Total:</span>
            <span>₹${invoice.totalAmount.toFixed(2)}</span>
          </div>
        </div>

        <div class="footer">
          Thank you for shopping locally with ${env.STORE_NAME}! This is a computer-generated tax invoice.
        </div>
      </body>
      </html>
    `;
  }
}

export const invoiceService = new InvoiceService();
