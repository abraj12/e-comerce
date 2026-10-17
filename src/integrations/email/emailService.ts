import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { env } from '../../core/config/env.js';
import { logger } from '../../core/logging/logger.js';

class EmailService {
  private transporter: Transporter | null = null;
  public sentEmails: Array<{ to: string; subject: string; html: string }> = [];

  constructor() {
    this.initTransporter();
  }

  private initTransporter(): void {
    try {
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: false,
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS
        }
      });
    } catch (error) {
      logger.warn('Failed to initialize SMTP transporter. Running in mock email mode.', { error: (error as Error).message });
    }
  }

  async sendMail(to: string, subject: string, html: string): Promise<boolean> {
    // Record for tests and audit
    this.sentEmails.push({ to, subject, html });

    try {
      if (this.transporter && env.NODE_ENV === 'production') {
        await this.transporter.sendMail({
          from: `"${env.STORE_NAME}" <${env.SMTP_FROM}>`,
          to,
          subject,
          html
        });
      }
      logger.info(`[EMAIL SENT] To: ${to} | Subject: "${subject}"`);
      return true;
    } catch (error) {
      logger.error(`Failed to send email to ${to}`, error as Error);
      return false;
    }
  }

  async sendOrderConfirmation(to: string, orderNumber: string, totalAmount: number): Promise<boolean> {
    const subject = `Order Confirmation #${orderNumber} - ${env.STORE_NAME}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #2b6cb0;">Thank you for your order!</h2>
        <p>Your order <strong>#${orderNumber}</strong> has been received and is being processed.</p>
        <p><strong>Total Amount:</strong> ₹${totalAmount.toFixed(2)}</p>
        <p>We will notify you once your items are dispatched.</p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="font-size: 12px; color: #718096;">${env.STORE_NAME} - Local Retail Operations</p>
      </div>
    `;
    return this.sendMail(to, subject, html);
  }

  async sendLowStockAlert(productName: string, sku: string, currentStock: number, threshold: number): Promise<boolean> {
    const subject = `[LOW STOCK ALERT] ${productName} (${sku})`;
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #feb2b2; background-color: #fff5f5; border-radius: 8px;">
        <h3 style="color: #c53030;">Low Inventory Warning</h3>
        <p>Product: <strong>${productName}</strong></p>
        <p>SKU: <code>${sku}</code></p>
        <p>Current Available Stock: <strong>${currentStock}</strong> (Threshold: ${threshold})</p>
        <p>Please restock this item promptly to avoid overselling.</p>
      </div>
    `;
    return this.sendMail(env.STORE_EMAIL, subject, html);
  }
}

export const emailService = new EmailService();
