import { OrderStatus, Role } from '@prisma/client';
import { prisma } from '../../core/database/prisma.js';
import { recordAuditEvent } from '../../core/logging/audit.js';
import { eventBus } from '../../core/events/eventBus.js';

export class DeliveryService {
  async listZones(includeInactive = false) {
    const zones = await prisma.deliveryZone.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' }
    });

    return zones.map((z) => ({
      ...z,
      pinCodes: z.pinCodes.split(',').map((p) => p.trim())
    }));
  }

  async checkDeliveryAvailability(pinCode: string, subtotal = 0) {
    const cleanPin = pinCode.trim();
    const zones = await prisma.deliveryZone.findMany({
      where: { isActive: true }
    });

    for (const zone of zones) {
      const pins = zone.pinCodes.split(',').map((p) => p.trim());
      if (pins.includes(cleanPin)) {
        let finalFee = zone.deliveryFee;
        let isFreeDelivery = false;

        if (zone.minOrderForFreeDelivery !== null && subtotal >= zone.minOrderForFreeDelivery) {
          finalFee = 0;
          isFreeDelivery = true;
        }

        return {
          serviceable: true,
          zoneId: zone.id,
          zoneName: zone.name,
          pinCode: cleanPin,
          deliveryFee: finalFee,
          originalFee: zone.deliveryFee,
          isFreeDelivery,
          minOrderForFreeDelivery: zone.minOrderForFreeDelivery,
          estimatedDeliveryHours: zone.estimatedDeliveryHours
        };
      }
    }

    return {
      serviceable: false,
      pinCode: cleanPin,
      message: `Delivery is currently not available for PIN code ${cleanPin}. Store pickup is available.`
    };
  }

  async createZone(data: {
    name: string;
    pinCodes: string[];
    deliveryFee: number;
    minOrderForFreeDelivery?: number | null;
    estimatedDeliveryHours?: number;
  }) {
    return prisma.deliveryZone.create({
      data: {
        name: data.name,
        pinCodes: data.pinCodes.join(','),
        deliveryFee: data.deliveryFee,
        minOrderForFreeDelivery: data.minOrderForFreeDelivery ?? null,
        estimatedDeliveryHours: data.estimatedDeliveryHours || 24
      }
    });
  }

  async deleteZone(id: string) {
    return prisma.deliveryZone.delete({ where: { id } });
  }

  async listDeliveryStaff() {
    return prisma.user.findMany({
      where: { role: Role.DELIVERY, isActive: true },
      select: { id: true, name: true, email: true, phone: true }
    });
  }

  async assignStaff(orderId: string, deliveryStaffId: string, assignedByUserId?: string) {
    const staff = await prisma.user.findFirst({
      where: { id: deliveryStaffId, role: Role.DELIVERY, isActive: true }
    });

    if (!staff) {
      throw new Error('Designated user is not active delivery personnel');
    }

    const order = await prisma.order.update({
      where: { id: orderId },
      data: {
        deliveryStaffId,
        status: OrderStatus.DISPATCHED
      },
      include: { shippingAddress: true }
    });

    if (assignedByUserId) {
      await recordAuditEvent({
        userId: assignedByUserId,
        action: 'ORDER_ASSIGNED_TO_DELIVERY',
        entityType: 'Order',
        entityId: orderId,
        details: { deliveryStaffId, staffName: staff.name }
      });
    }

    eventBus.publish('delivery.assigned', {
      orderId,
      orderNumber: order.orderNumber,
      deliveryStaffId,
      staffName: staff.name
    });

    return order;
  }

  async updateDeliveryStatus(orderId: string, status: OrderStatus, updatedByUserId?: string) {
    const order = await prisma.order.update({
      where: { id: orderId },
      data: { status }
    });

    if (updatedByUserId) {
      await recordAuditEvent({
        userId: updatedByUserId,
        action: 'DELIVERY_STATUS_UPDATED',
        entityType: 'Order',
        entityId: orderId,
        details: { newStatus: status }
      });
    }

    eventBus.publish('order.status_updated', {
      orderId,
      status
    });

    return order;
  }
}

export const deliveryService = new DeliveryService();
