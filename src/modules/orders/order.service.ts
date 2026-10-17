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

export const ALLOWED_ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.PAID, OrderStatus.PROCESSING, OrderStatus.CANCELLED],
  [OrderStatus.PAID]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED, OrderStatus.REFUNDED],
  [OrderStatus.PROCESSING]: [OrderStatus.DISPATCHED, OrderStatus.CANCELLED, OrderStatus.REFUNDED],
  [OrderStatus.DISPATCHED]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED, OrderStatus.REFUNDED],
  [OrderStatus.DELIVERED]: [OrderStatus.REFUNDED],
  [OrderStatus.CANCELLED]: [], // Terminal state
  [OrderStatus.REFUNDED]: []   // Terminal state
};

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

    // Authoritatively recalculate current prices from database to prevent stale cart prices or price tampering
    const variantIds = cart.items.map((i) => i.variantId);
    const liveVariants = await prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: { product: true }
    });
    const variantMap = new Map(liveVariants.map((v) => [v.id, v]));

    let authoritativeSubtotal = 0;
    const recalculatedItems = cart.items.map((item) => {
      const liveVariant = variantMap.get(item.variantId);
      if (!liveVariant || !liveVariant.product.isActive) {
        throw new Error(`Product variant "${item.productName}" is no longer active or available`);
      }
      const unitPrice = liveVariant.price;
      const itemTotal = Number((item.quantity * unitPrice).toFixed(2));
      authoritativeSubtotal += itemTotal;
      return {
        ...item,
        unitPrice,
        itemTotal,
        productName: liveVariant.product.name,
        variantName: liveVariant.name,
        sku: liveVariant.sku
      };
    });
    authoritativeSubtotal = Number(authoritativeSubtotal.toFixed(2));

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
        authoritativeSubtotal
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
      validatedCoupon = await promotionService.validateCoupon(effectiveCoupon, authoritativeSubtotal);
      discountAmount = validatedCoupon.discountAmount;
    }

    const discountedSubtotal = Math.max(0, authoritativeSubtotal - discountAmount);
    const taxRate = env.TAX_RATE_PERCENTAGE / 100;
    const taxAmount = Number((discountedSubtotal * taxRate).toFixed(2));
    const totalAmount = Number((discountedSubtotal + taxAmount + deliveryFee).toFixed(2));

    const orderNumber = generateOrderNumber();
    const invoiceNumber = generateInvoiceNumber();
    // Cryptographically secure token for deliberate guest order/invoice access
    const guestAccessToken = !customerId ? crypto.randomBytes(24).toString('hex') : null;

    // Atomic execution: reserve stock with optimistic version checking, create order, invoice, and clear cart
    const createdOrder = await prisma.$transaction(async (tx) => {
      // 1. Atomically reserve stock for each item using version concurrency guard
      for (const item of recalculatedItems) {
        await inventoryService.reserveStock(
          item.variantId,
          item.quantity,
          orderNumber,
          tx
        );
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
          subtotal: authoritativeSubtotal,
          discountAmount,
          couponCode: effectiveCoupon || null,
          taxAmount,
          totalAmount,
          status: initialStatus,
          paymentMethod,
          paymentStatus: PaymentStatus.PENDING,
          guestAccessToken,
          notes: notes || null,
          items: {
            create: recalculatedItems.map((i) => ({
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
          subtotal: authoritativeSubtotal,
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

  /**
   * Protected order retrieval: Enforces strict ownership checks and rejects unauthenticated access.
   */
  async getOrderById(
    orderId: string,
    requestingUser?: { userId: string; role: string },
    guestToken?: string
  ) {
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

    // 1. If requester is authenticated
    if (requestingUser) {
      if (requestingUser.role === 'CUSTOMER' && order.customerId !== requestingUser.userId) {
        throw new Error('Forbidden: You are not authorized to view this order');
      }
      return order;
    }

    // 2. If requester is unauthenticated
    // Orders with customer accounts strictly require authentication
    if (order.customerId) {
      throw new Error('Unauthorized: Authentication required to view private order');
    }

    // Guest checkout orders require a matching guestAccessToken
    if (guestToken && order.guestAccessToken && guestToken === order.guestAccessToken) {
      return order;
    }

    throw new Error('Unauthorized: Authentication or valid guest access token required to view order');
  }

  /**
   * Public Safe Order Tracking: Returns non-sensitive fulfillment status only.
   */
  async trackOrderPublic(orderNumber: string) {
    const order = await prisma.order.findFirst({
      where: {
        OR: [{ orderNumber }, { id: orderNumber }]
      },
      select: {
        orderNumber: true,
        status: true,
        deliveryType: true,
        createdAt: true,
        items: {
          select: {
            productName: true,
            variantName: true,
            quantity: true
          }
        }
      }
    });

    if (!order) {
      throw new Error(`Order not found for tracking: ${orderNumber}`);
    }

    return {
      orderNumber: order.orderNumber,
      status: order.status,
      deliveryType: order.deliveryType,
      createdAt: order.createdAt,
      itemCount: order.items.length,
      items: order.items
    };
  }

  /**
   * Explicit order status transition validation and atomic inventory state handling.
   */
  async updateOrderStatus(orderId: string, newStatus: OrderStatus, reason?: string, updaterUserId?: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true }
    });

    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    const previousStatus = order.status;

    // Idempotent no-op if status is unchanged
    if (previousStatus === newStatus) {
      return order;
    }

    // Enforce explicit order-status transition state machine
    const allowedNextStatuses = ALLOWED_ORDER_STATUS_TRANSITIONS[previousStatus] || [];
    if (!allowedNextStatuses.includes(newStatus)) {
      throw new Error(
        `Invalid order status transition: Cannot transition order from ${previousStatus} to ${newStatus}`
      );
    }

    // Atomic transaction for order status update and inventory handling
    const updated = await prisma.$transaction(async (tx) => {
      // Handle inventory state transitions
      if (newStatus === OrderStatus.CANCELLED) {
        for (const item of order.items) {
          if (item.variantId) {
            if (previousStatus === OrderStatus.PENDING || previousStatus === OrderStatus.PROCESSING) {
              await inventoryService.releaseReservation(item.variantId, item.quantity, order.orderNumber, tx);
            } else if (previousStatus === OrderStatus.DISPATCHED || previousStatus === OrderStatus.DELIVERED) {
              await inventoryService.adjustStock({
                variantId: item.variantId,
                quantityChange: item.quantity,
                reason: 'CANCEL_RESTOCK',
                referenceId: order.orderNumber,
                performedBy: updaterUserId
              }, tx);
            }
          }
        }
      } else if (newStatus === OrderStatus.REFUNDED) {
        // Only restock if transitioning from active fulfilled states
        if (previousStatus === OrderStatus.DISPATCHED || previousStatus === OrderStatus.DELIVERED) {
          for (const item of order.items) {
            if (item.variantId) {
              await inventoryService.adjustStock({
                variantId: item.variantId,
                quantityChange: item.quantity,
                reason: 'REFUND_RESTOCK',
                referenceId: order.orderNumber,
                performedBy: updaterUserId
              }, tx);
            }
          }
        } else if (previousStatus === OrderStatus.PENDING || previousStatus === OrderStatus.PROCESSING) {
          for (const item of order.items) {
            if (item.variantId) {
              await inventoryService.releaseReservation(item.variantId, item.quantity, order.orderNumber, tx);
            }
          }
        }
      } else if (
        newStatus === OrderStatus.PAID &&
        previousStatus !== OrderStatus.PAID &&
        previousStatus !== OrderStatus.DELIVERED
      ) {
        // Commit reserved stock
        for (const item of order.items) {
          if (item.variantId) {
            await inventoryService.commitReservation(item.variantId, item.quantity, order.orderNumber, tx);
          }
        }
      }

      return tx.order.update({
        where: { id: orderId },
        data: {
          status: newStatus,
          cancelledReason: reason || order.cancelledReason,
          paymentStatus: newStatus === OrderStatus.PAID ? PaymentStatus.COMPLETED : order.paymentStatus
        }
      });
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
