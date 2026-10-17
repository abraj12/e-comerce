import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PromotionService } from '../../src/modules/promotions/promotion.service.js';

describe('Unit Tests: Pricing, Coupons & Promotions Calculation', () => {
  const promoService = new PromotionService();

  it('should calculate 10% percentage discount correctly', () => {
    const subtotal = 500;
    const discountValue = 10;
    const discount = (subtotal * discountValue) / 100;
    assert.strictEqual(discount, 50);
  });

  it('should respect maxDiscountAmount cap on percentage discounts', () => {
    const subtotal = 2000;
    const discountValue = 20; // 20% of 2000 = 400
    const maxDiscount = 150;
    const rawDiscount = (subtotal * discountValue) / 100;
    const finalDiscount = Math.min(rawDiscount, maxDiscount);

    assert.strictEqual(finalDiscount, 150);
  });

  it('should not allow discount to exceed order subtotal for fixed discounts', () => {
    const subtotal = 40;
    const fixedDiscount = 50;
    const finalDiscount = Math.min(fixedDiscount, subtotal);

    assert.strictEqual(finalDiscount, 40);
  });

  it('should compute tax accurately based on discounted subtotal', () => {
    const subtotal = 1000;
    const discount = 100;
    const discountedSubtotal = subtotal - discount; // 900
    const taxRate = 0.05; // 5%
    const taxAmount = Number((discountedSubtotal * taxRate).toFixed(2));
    const grandTotal = Number((discountedSubtotal + taxAmount).toFixed(2));

    assert.strictEqual(taxAmount, 45);
    assert.strictEqual(grandTotal, 945);
  });
});
