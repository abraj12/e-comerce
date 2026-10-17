import { DiscountType } from '@prisma/client';
import { prisma } from '../../core/database/prisma.js';

export class PromotionService {
  async listCoupons(includeInactive = false) {
    return prisma.coupon.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { createdAt: 'desc' }
    });
  }

  async validateCoupon(code: string, subtotal: number) {
    const coupon = await prisma.coupon.findUnique({
      where: { code: code.trim().toUpperCase() }
    });

    if (!coupon || !coupon.isActive) {
      throw new Error('Coupon code is invalid or inactive');
    }

    const now = new Date();
    if (coupon.validFrom && coupon.validFrom > now) {
      throw new Error('Coupon is not yet active');
    }

    if (coupon.validUntil && coupon.validUntil < now) {
      throw new Error('Coupon has expired');
    }

    if (subtotal < coupon.minOrderAmount) {
      throw new Error(`Minimum order amount of ₹${coupon.minOrderAmount} required to use this coupon`);
    }

    if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
      throw new Error('Coupon usage limit has been reached');
    }

    let discountAmount = 0;
    if (coupon.discountType === DiscountType.PERCENTAGE) {
      discountAmount = (subtotal * coupon.discountValue) / 100;
      if (coupon.maxDiscountAmount && discountAmount > coupon.maxDiscountAmount) {
        discountAmount = coupon.maxDiscountAmount;
      }
    } else {
      discountAmount = Math.min(coupon.discountValue, subtotal);
    }

    return {
      valid: true,
      couponId: coupon.id,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      discountAmount: Number(discountAmount.toFixed(2))
    };
  }

  async incrementUsage(couponId: string) {
    await prisma.coupon.update({
      where: { id: couponId },
      data: { usageCount: { increment: 1 } }
    });
  }

  async createCoupon(data: any) {
    const code = data.code.trim().toUpperCase();
    const existing = await prisma.coupon.findUnique({ where: { code } });
    if (existing) {
      throw new Error(`Coupon with code '${code}' already exists`);
    }

    return prisma.coupon.create({
      data: {
        code,
        discountType: data.discountType,
        discountValue: data.discountValue,
        minOrderAmount: data.minOrderAmount || 0,
        maxDiscountAmount: data.maxDiscountAmount || null,
        usageLimit: data.usageLimit || null,
        validFrom: data.validFrom || new Date(),
        validUntil: data.validUntil || null,
        isActive: data.isActive !== undefined ? data.isActive : true
      }
    });
  }

  async deleteCoupon(id: string) {
    return prisma.coupon.delete({ where: { id } });
  }
}

export const promotionService = new PromotionService();
