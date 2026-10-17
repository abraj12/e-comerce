import { prisma } from '../../core/database/prisma.js';
import { env } from '../../core/config/env.js';

/**
 * Robust HTML escaping function to prevent XSS / HTML injection
 * when rendering dynamic invoice templates.
 */
export function escapeHtml(str: any): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class InvoiceService {
  async getInvoiceByOrderId(
    orderId: string,
    requestingUser?: { userId: string; role: string },
    guestToken?: string
  ) {
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

    // 1. Authenticated Access
    if (requestingUser) {
      if (
        requestingUser.role === 'CUSTOMER' &&
        invoice.order.customerId !== requestingUser.userId
      ) {
        throw new Error('Forbidden: You are not authorized to view this invoice');
      }
      return invoice;
    }

    // 2. Anonymous Access
    // If order is bound to a registered customer account, anonymous access is strictly prohibited
    if (invoice.order.customerId) {
      throw new Error('Unauthorized: Authentication required to view private customer invoice');
    }

    // If order was a guest checkout, verify against the secure guestAccessToken
    if (
      guestToken &&
      invoice.order.guestAccessToken &&
      guestToken === invoice.order.guestAccessToken
    ) {
      return invoice;
    }

    throw new Error('Unauthorized: Authentication or valid guest access token required to view invoice');
  }

  generateHtmlInvoice(invoice: any): string {
    const { order } = invoice;
    const itemsRows = order.items
      .map(
        (i: any) => `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${escapeHtml(i.productName)} (${escapeHtml(i.variantName)})</td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">${escapeHtml(i.sku)}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">₹${i.unitPrice.toFixed(2)}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">${i.quantity}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">₹${i.totalPrice.toFixed(2)}</td>
        </tr>
      `
      )
      .join('');

    const recipient = escapeHtml(order.shippingAddress?.recipientName || order.customerEmail);
    const street = escapeHtml(order.shippingAddress?.streetAddress || 'Store Pickup');
    const cityLine = order.shippingAddress
      ? escapeHtml(`${order.shippingAddress.city}, ${order.shippingAddress.state} - ${order.shippingAddress.pinCode}`)
      : '';
    const phone = escapeHtml(order.customerPhone);
    const storeName = escapeHtml(env.STORE_NAME);
    const storeEmail = escapeHtml(env.STORE_EMAIL);
    const storePhone = escapeHtml(env.STORE_PHONE);
    const invoiceNumber = escapeHtml(invoice.invoiceNumber);
    const orderNumber = escapeHtml(order.orderNumber);
    const paymentMethod = escapeHtml(order.paymentMethod);
    const paymentStatus = escapeHtml(order.paymentStatus);
    const deliveryType = escapeHtml(order.deliveryType);
    const couponCode = escapeHtml(order.couponCode || 'Promo');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Invoice #${invoiceNumber}</title>
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
            <div class="brand">${storeName}</div>
            <div style="font-size: 13px; color: #718096; margin-top: 4px;">Local Retail Store & Fulfillment</div>
            <div style="font-size: 13px; color: #718096;">Email: ${storeEmail} | Phone: ${storePhone}</div>
          </div>
          <div class="invoice-details">
            <h1 style="margin: 0; font-size: 26px; color: #2d3748;">TAX INVOICE</h1>
            <div style="margin-top: 8px; font-size: 14px;"><strong>Invoice #:</strong> ${invoiceNumber}</div>
            <div style="font-size: 14px;"><strong>Order #:</strong> ${orderNumber}</div>
            <div style="font-size: 14px;"><strong>Date:</strong> ${new Date(invoice.invoiceDate).toLocaleDateString()}</div>
          </div>
        </div>

        <div class="info-grid">
          <div>
            <h4 style="margin: 0 0 8px 0; color: #4a5568;">BILLED & DELIVERED TO:</h4>
            <div><strong>${recipient}</strong></div>
            <div>${street}</div>
            <div>${cityLine}</div>
            <div>Phone: ${phone}</div>
          </div>
          <div style="text-align: right;">
            <h4 style="margin: 0 0 8px 0; color: #4a5568;">PAYMENT & FULFILLMENT:</h4>
            <div>Payment Method: <strong>${paymentMethod}</strong></div>
            <div>Payment Status: <strong>${paymentStatus}</strong></div>
            <div>Delivery Mode: <strong>${deliveryType}</strong></div>
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
          ${invoice.discountAmount > 0 ? `<div class="summary-row" style="color: #38a169;"><span>Discount (${couponCode}):</span><span>-₹${invoice.discountAmount.toFixed(2)}</span></div>` : ''}
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
          Thank you for shopping locally with ${storeName}! This is a computer-generated tax invoice.
        </div>
      </body>
      </html>
    `;
  }
}

export const invoiceService = new InvoiceService();
