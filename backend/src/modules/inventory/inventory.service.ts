import { prisma } from '../../core/database/prisma.js';
import { eventBus } from '../../core/events/eventBus.js';
import { emailService } from '../../integrations/email/emailService.js';
import { logger } from '../../core/logging/logger.js';
import { Prisma } from '@prisma/client';

type DbClient = Prisma.TransactionClient | typeof prisma;

export class InventoryService {
  async adjustStock(params: {
    variantId: string;
    quantityChange: number;
    reason: string;
    referenceId?: string;
    performedBy?: string;
  }, client?: DbClient) {
    const { variantId, quantityChange, reason, referenceId, performedBy } = params;

    const execute = async (tx: DbClient) => {
      const item = await tx.inventoryItem.findUnique({
        where: { variantId },
        include: { variant: { include: { product: true } } }
      });

      if (!item) {
        throw new Error(`Inventory item for variant ${variantId} not found`);
      }

      const previousStock = item.stockQuantity;
      const newStock = previousStock + quantityChange;

      if (newStock < item.reservedQuantity) {
        throw new Error(
          `Cannot reduce stock to ${newStock} because ${item.reservedQuantity} units are currently reserved for pending orders`
        );
      }

      const updated = await tx.inventoryItem.update({
        where: { id: item.id },
        data: {
          stockQuantity: newStock,
          version: { increment: 1 }
        }
      });

      await tx.inventoryLog.create({
        data: {
          variantId,
          changeAmount: quantityChange,
          previousStock,
          newStock,
          reason,
          referenceId,
          performedBy: performedBy || 'SYSTEM'
        }
      });

      const available = newStock - item.reservedQuantity;
      if (available <= item.lowStockThreshold) {
        eventBus.publish('inventory.low_stock', {
          variantId,
          productName: item.variant.product.name,
          sku: item.variant.sku,
          availableStock: available,
          threshold: item.lowStockThreshold
        });
        emailService.sendLowStockAlert(
          item.variant.product.name,
          item.variant.sku,
          available,
          item.lowStockThreshold
        );
      }

      return updated;
    };

    if (client) {
      return execute(client);
    }
    return prisma.$transaction(execute);
  }

  /**
   * Atomic stock reservation with optimistic concurrency version checking and retry.
   * Guarantees overselling protection under high concurrency across both PostgreSQL and SQLite.
   */
  async reserveStock(
    variantId: string,
    quantityToReserve: number,
    orderId?: string,
    client?: DbClient
  ): Promise<boolean> {
    const MAX_RETRIES = 5;

    const execute = async (tx: DbClient) => {
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const item = await tx.inventoryItem.findUnique({
          where: { variantId },
          include: { variant: { include: { product: true } } }
        });

        if (!item) {
          throw new Error(`Variant ${variantId} does not exist in inventory`);
        }

        const available = item.stockQuantity - item.reservedQuantity;
        if (available < quantityToReserve) {
          throw new Error(
            `Insufficient stock for item '${item.variant.product.name} (${item.variant.sku})'. Requested: ${quantityToReserve}, Available: ${available}`
          );
        }

        // Atomic conditional update using version guard
        const updateResult = await tx.inventoryItem.updateMany({
          where: {
            id: item.id,
            version: item.version
          },
          data: {
            reservedQuantity: { increment: quantityToReserve },
            version: { increment: 1 }
          }
        });

        if (updateResult.count > 0) {
          await tx.inventoryLog.create({
            data: {
              variantId,
              changeAmount: quantityToReserve,
              previousStock: item.stockQuantity,
              newStock: item.stockQuantity,
              reason: 'ORDER_RESERVATION',
              referenceId: orderId,
              performedBy: 'SYSTEM'
            }
          });
          return true;
        }

        // Version conflict: wait with exponential jitter and retry
        await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 20 + 5)));
      }

      throw new Error(`Concurrency conflict reserving stock for variant ${variantId}. Please try again.`);
    };

    if (client) {
      return execute(client);
    }
    return prisma.$transaction(execute);
  }

  /**
   * Commit reservation: deduct from both total stock and reserved stock atomically
   */
  async commitReservation(
    variantId: string,
    quantityToDeduct: number,
    orderId?: string,
    client?: DbClient
  ): Promise<void> {
    const execute = async (tx: DbClient) => {
      const item = await tx.inventoryItem.findUnique({ where: { variantId } });
      if (!item) return;

      const newStock = Math.max(0, item.stockQuantity - quantityToDeduct);
      const newReserved = Math.max(0, item.reservedQuantity - quantityToDeduct);

      await tx.inventoryItem.update({
        where: { id: item.id },
        data: {
          stockQuantity: newStock,
          reservedQuantity: newReserved,
          version: { increment: 1 }
        }
      });

      await tx.inventoryLog.create({
        data: {
          variantId,
          changeAmount: -quantityToDeduct,
          previousStock: item.stockQuantity,
          newStock,
          reason: 'ORDER_FULFILLED',
          referenceId: orderId,
          performedBy: 'SYSTEM'
        }
      });
    };

    if (client) {
      await execute(client);
    } else {
      await prisma.$transaction(execute);
    }
  }

  /**
   * Release reserved stock on order cancellation or checkout timeout
   */
  async releaseReservation(
    variantId: string,
    quantityToRelease: number,
    orderId?: string,
    client?: DbClient
  ): Promise<void> {
    const execute = async (tx: DbClient) => {
      const item = await tx.inventoryItem.findUnique({ where: { variantId } });
      if (!item) return;

      const newReserved = Math.max(0, item.reservedQuantity - quantityToRelease);

      await tx.inventoryItem.update({
        where: { id: item.id },
        data: {
          reservedQuantity: newReserved,
          version: { increment: 1 }
        }
      });

      await tx.inventoryLog.create({
        data: {
          variantId,
          changeAmount: 0,
          previousStock: item.stockQuantity,
          newStock: item.stockQuantity,
          reason: 'RESERVATION_RELEASED',
          referenceId: orderId,
          performedBy: 'SYSTEM'
        }
      });
    };

    if (client) {
      await execute(client);
    } else {
      await prisma.$transaction(execute);
    }
  }

  async getLowStockItems() {
    const items = await prisma.inventoryItem.findMany({
      include: {
        variant: {
          include: {
            product: { select: { id: true, name: true, slug: true } }
          }
        }
      }
    });

    return items
      .filter((i) => i.stockQuantity - i.reservedQuantity <= i.lowStockThreshold)
      .map((i) => ({
        id: i.id,
        variantId: i.variantId,
        productName: i.variant.product.name,
        variantName: i.variant.name,
        sku: i.variant.sku,
        stockQuantity: i.stockQuantity,
        reservedQuantity: i.reservedQuantity,
        availableQuantity: i.stockQuantity - i.reservedQuantity,
        lowStockThreshold: i.lowStockThreshold,
        location: i.location
      }));
  }

  async getInventoryLogs(variantId?: string, limit = 50) {
    return prisma.inventoryLog.findMany({
      where: variantId ? { variantId } : {},
      include: {
        variant: {
          select: {
            sku: true,
            name: true,
            product: { select: { name: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });
  }
}

export const inventoryService = new InventoryService();
