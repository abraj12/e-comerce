import { OrderStatus } from '@prisma/client';
import { prisma } from '../../core/database/prisma.js';

export class ReportingService {
  async getDashboardSummary() {
    const [
      totalOrders,
      paidOrders,
      totalCustomers,
      productsCount,
      lowStockCount,
      recentOrders,
      ordersByStatus
    ] = await Promise.all([
      prisma.order.count(),
      prisma.order.findMany({
        where: {
          status: { in: [OrderStatus.PAID, OrderStatus.PROCESSING, OrderStatus.DISPATCHED, OrderStatus.DELIVERED] }
        },
        select: { totalAmount: true }
      }),
      prisma.user.count({ where: { role: 'CUSTOMER' } }),
      prisma.product.count({ where: { isActive: true } }),
      prisma.inventoryItem.count({
        where: {
          stockQuantity: { lte: 5 }
        }
      }),
      prisma.order.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { items: true }
      }),
      prisma.order.groupBy({
        by: ['status'],
        _count: { id: true }
      })
    ]);

    const totalRevenue = paidOrders.reduce((sum, o) => sum + o.totalAmount, 0);

    return {
      totalRevenue: Number(totalRevenue.toFixed(2)),
      totalOrders,
      totalCustomers,
      activeProducts: productsCount,
      lowStockItems: lowStockCount,
      ordersByStatus: ordersByStatus.reduce((acc, curr) => {
        acc[curr.status] = curr._count.id;
        return acc;
      }, {} as Record<string, number>),
      recentOrders
    };
  }

  async getTopSellingProducts(limit = 10) {
    const orderItems = await prisma.orderItem.groupBy({
      by: ['productName', 'sku'],
      _sum: {
        quantity: true,
        totalPrice: true
      },
      orderBy: {
        _sum: {
          quantity: 'desc'
        }
      },
      take: limit
    });

    return orderItems.map((item) => ({
      productName: item.productName,
      sku: item.sku,
      totalQuantitySold: item._sum.quantity || 0,
      totalRevenue: Number((item._sum.totalPrice || 0).toFixed(2))
    }));
  }

  async getAuditLogs(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        include: {
          user: { select: { id: true, name: true, email: true, role: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.auditLog.count()
    ]);

    return {
      logs: logs.map((l) => ({
        ...l,
        details: l.details ? JSON.parse(l.details) : null
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }
}

export const reportingService = new ReportingService();
