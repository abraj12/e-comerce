import { OrderStatus, PaymentMethod, PaymentStatus, DeliveryType } from '@prisma/client';
import { prisma } from '../../core/database/prisma.js';
import { cartService } from '../cart/cart.service.js';
import { inventoryService } from '../inventory/inventory.service.js';
import { promotionService } from '../promotions/promotion.service.js';
import { deliveryService } from '../delivery/delivery.service.js';
import { emailService } from '../../integrations/email/emailService.js';
import { eventBus } from '../../core/events/eventBus.js';
import { recordAuditEvent } from '../../core/logging/audit.js';
import { env } from '../../core/config/env.js';
import crypto from 'crypto';

function generateOrderNumber(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `ORD-${dateStr}-${randomSuffix}`;
}

function generateInvoiceNumber(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `INV-${dateStr}-${randomSuffix}`;
}

export class OrderService {
  async createOrderFromCart(params: {
    customerId?: string;
    sessionId?: string;
    cartId?: string;
    deliveryType: DeliveryType;
    shippingAddress?: {
      recipientName: string;
      phone: string;
      streetAddress: string;
      city: string;
      state: string;
      pinCode: string;
    };
    paymentMethod: PaymentMethod;
    customerEmail: string;
    customerPhone: string;
    couponCode?: string;
    notes?: string;
  }) {
    const {
      customerId,
      sessionId,
      deliveryType,
      shippingAddress,
      paymentMethod,
      customerEmail,
      customerPhone,
      couponCode,
      notes
    } = params;

    // Retrieve cart
    const cart = await cartService.getCart(customerId, sessionId);
    if (!cart.items || cart.items.length === 0) {
      throw new Error('Cannot checkout: Shopping cart is empty');
    }

    // Validate delivery and calculate fee
    let deliveryFee = 0;
    let deliveryZoneId: string | null = null;
    let addressId: string | null = null;

    if (deliveryType === DeliveryType.LOCAL_DELIVERY) {
      if (!shippingAddress) {
        throw new Error('Shipping address is required for local delivery');
      }

      const availability = await deliveryService.checkDeliveryAvailability(
        shippingAddress.pinCode,
        cart.subtotal
      );

      if (!availability.serviceable) {
        throw new Error(
          `Delivery is not available to PIN code ${shippingAddress.pinCode}. Please select store pickup.`
        );
      }

      deliveryFee = availability.deliveryFee || 0;
      deliveryZoneId = availability.zoneId || null;

      // Save Address in DB
      if (customerId) {
        const addr = await prisma.address.create({
          data: {
            userId: customerId,
            recipientName: shippingAddress.recipientName,
            phone: shippingAddress.phone,
            streetAddress: shippingAddress.streetAddress,
            city: shippingAddress.city,
            state: shippingAddress.state,
            pinCode: shippingAddress.pinCode
          }
        });
        addressId = addr.id;
      }
    }

    // Coupon calculation
    let discountAmount = 0;
    const effectiveCoupon = couponCode || cart.couponCode;
    let validatedCoupon: any = null;

    if (effectiveCoupon) {
      validatedCoupon = await promotionService.validateCoupon(effectiveCoupon, cart.subtotal);
      discountAmount = validatedCoupon.discountAmount;
    }

    const discountedSubtotal = Math.max(0, cart.subtotal - discountAmount);
    const taxRate = env.TAX_RATE_PERCENTAGE / 100;
    const taxAmount = Number((discountedSubtotal * taxRate).toFixed(2));
    const totalAmount = Number((discountedSubtotal + taxAmount + deliveryFee).toFixed(2));

    const orderNumber = generateOrderNumber();
    const invoiceNumber = generateInvoiceNumber();

    // Atomic execution: reserve stock, create order, order items, invoice, and clear cart
    const createdOrder = await prisma.$transaction(async (tx) => {
      // 1. Reserve stock for each item
      for (const item of cart.items) {
        const inventory = await tx.inventoryItem.findUnique({
          where: { variantId: item.variantId }
        });

        if (!inventory) {
          throw new Error(`Inventory item for variant ${item.variantId} not found`);
        }

        const available = inventory.stockQuantity - inventory.reservedQuantity;
        if (available < item.quantity) {
          throw new Error(
            `Insufficient stock for item '${item.productName} (${item.sku})'. Available: ${available}, Requested: ${item.quantity}`
          );
        }

        await tx.inventoryItem.update({
          where: { id: inventory.id },
          data: {
            reservedQuantity: { increment: item.quantity },
            version: { increment: 1 }
          }
        });

        await tx.inventoryLog.create({
          data: {
            variantId: item.variantId,
            changeAmount: item.quantity,
            previousStock: inventory.stockQuantity,
            newStock: inventory.stockQuantity,
            reason: 'ORDER_RESERVATION',
            referenceId: orderNumber,
            performedBy: customerId || 'GUEST'
          }
        });
      }

      // 2. Create Order
      const initialStatus =
        paymentMethod === PaymentMethod.CASH_ON_DELIVERY ? OrderStatus.PROCESSING : OrderStatus.PENDING;

      const order = await tx.order.create({
        data: {
          orderNumber,
          customerId: customerId || null,
          customerEmail,
          customerPhone,
          shippingAddressId: addressId,
          deliveryType,
          deliveryZoneId,
          deliveryFee,
          subtotal: cart.subtotal,
          discountAmount,
          couponCode: effectiveCoupon || null,
          taxAmount,
          totalAmount,
          status: initialStatus,
          paymentMethod,
          paymentStatus: PaymentStatus.PENDING,
          notes: notes || null,
          items: {
            create: cart.items.map((i) => ({
              variantId: i.variantId,
              productName: i.productName,
              variantName: i.variantName,
              sku: i.sku,
              unitPrice: i.unitPrice,
              quantity: i.quantity,
              totalPrice: i.itemTotal
            }))
          }
        },
        include: { items: true }
      });

      // 3. Create Invoice
      await tx.invoice.create({
        data: {
          invoiceNumber,
          orderId: order.id,
          subtotal: cart.subtotal,
          taxAmount,
          deliveryFee,
          discountAmount,
          totalAmount
        }
      });

      // 4. Update coupon usage
      if (validatedCoupon) {
        await tx.coupon.update({
          where: { id: validatedCoupon.couponId },
          data: { usageCount: { increment: 1 } }
        });
      }

      // 5. Clear shopping cart
      await tx.cartItem.deleteMany({ where: { cartId: cart.cartId } });
      await tx.cart.update({
        where: { id: cart.cartId },
        data: { couponCode: null }
      });

      return order;
    });

    // Post-transaction events and notifications
    eventBus.publish('order.created', {
      orderId: createdOrder.id,
      orderNumber: createdOrder.orderNumber,
      totalAmount: createdOrder.totalAmount,
      customerEmail: createdOrder.customerEmail
    });

    // Send confirmation email
    emailService.sendOrderConfirmation(customerEmail, orderNumber, totalAmount);

    return createdOrder;
  }

  async listOrders(filters: {
    customerId?: string;
    status?: OrderStatus;
    page?: number;
    limit?: number;
  } = {}) {
    const { customerId, status, page = 1, limit = 20 } = filters;
    const where: any = {};

    if (customerId) where.customerId = customerId;
    if (status) where.status = status;

    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          items: true,
          shippingAddress: true,
          deliveryStaff: { select: { id: true, name: true, phone: true } },
          invoice: true
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.order.count({ where })
    ]);

    return {
      orders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async getOrderById(orderId: string, requestingUser?: { userId: string; role: string }) {
    const order = await prisma.order.findFirst({
      where: {
        OR: [{ id: orderId }, { orderNumber: orderId }]
      },
      include: {
        items: true,
        shippingAddress: true,
        deliveryZone: true,
        deliveryStaff: { select: { id: true, name: true, phone: true } },
        payments: true,
        invoice: true
      }
    });

    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    // Access control: Customer can only see their own order; Employees/Admin can inspect any order
    if (
      requestingUser &&
      requestingUser.role === 'CUSTOMER' &&
      order.customerId !== requestingUser.userId
    ) {
      throw new Error('Forbidden: You are not authorized to view this order');
    }

    return order;
  }

  async updateOrderStatus(orderId: string, newStatus: OrderStatus, reason?: string, updaterUserId?: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true }
    });

    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    const previousStatus = order.status;

    // Handle inventory state transitions
    if (newStatus === OrderStatus.CANCELLED || newStatus === OrderStatus.REFUNDED) {
      // Release or restock items
      for (const item of order.items) {
        if (item.variantId) {
          if (previousStatus === OrderStatus.PENDING || previousStatus === OrderStatus.PROCESSING) {
            await inventoryService.releaseReservation(item.variantId, item.quantity, order.orderNumber);
          } else if (previousStatus === OrderStatus.DISPATCHED || previousStatus === OrderStatus.DELIVERED) {
            await inventoryService.adjustStock({
              variantId: item.variantId,
              quantityChange: item.quantity,
              reason: 'RETURN',
              referenceId: order.orderNumber,
              performedBy: updaterUserId
            });
          }
        }
      }
    } else if (
      (newStatus === OrderStatus.PAID || newStatus === OrderStatus.DELIVERED) &&
      previousStatus !== OrderStatus.PAID &&
      previousStatus !== OrderStatus.DELIVERED
    ) {
      // Commit reserved stock
      for (const item of order.items) {
        if (item.variantId) {
          await inventoryService.commitReservation(item.variantId, item.quantity, order.orderNumber);
        }
      }
    }

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: newStatus,
        cancelledReason: reason || order.cancelledReason,
        paymentStatus: newStatus === OrderStatus.PAID ? PaymentStatus.COMPLETED : order.paymentStatus
      }
    });

    if (updaterUserId) {
      await recordAuditEvent({
        userId: updaterUserId,
        action: 'ORDER_STATUS_UPDATED',
        entityType: 'Order',
        entityId: orderId,
        details: { from: previousStatus, to: newStatus, reason }
      });
    }

    eventBus.publish('order.status_updated', {
      orderId,
      orderNumber: order.orderNumber,
      previousStatus,
      newStatus
    });

    return updated;
  }
}

export const orderService = new OrderService();
