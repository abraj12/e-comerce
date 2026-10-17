import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../src/core/database/prisma.js';
import { inventoryService } from '../../src/modules/inventory/inventory.service.js';
import { orderService } from '../../src/modules/orders/order.service.js';
import { cartService } from '../../src/modules/cart/cart.service.js';
import { OrderStatus, PaymentMethod } from '@prisma/client';

describe('Concurrency & Inventory Overselling Protection Tests', () => {
  let testVariantId: string;
  let checkoutVariantId: string;

  before(async () => {
    // Create an isolated product variant for high-concurrency reservation test
    const product = await prisma.product.create({
      data: {
        name: 'Flash Sale Limited Item',
        slug: `flash-sale-limited-${Date.now()}`,
        basePrice: 99.0,
        sku: `CONCURR-${Date.now()}`,
        variants: {
          create: {
            name: 'Limited Edition',
            sku: `CONCURR-VAR-${Date.now()}`,
            price: 99.0,
            inventory: {
              create: {
                stockQuantity: 2, // ONLY 2 ITEMS IN STOCK
                reservedQuantity: 0,
                lowStockThreshold: 1
              }
            }
          }
        }
      },
      include: { variants: true }
    });

    testVariantId = product.variants[0].id;

    // Create another variant for checkout concurrency
    const checkoutProduct = await prisma.product.create({
      data: {
        name: 'Limited Checkout Item',
        slug: `limited-checkout-${Date.now()}`,
        basePrice: 150.0,
        sku: `CHK-CONCURR-${Date.now()}`,
        variants: {
          create: {
            name: 'Checkout Variant',
            sku: `CHK-VAR-${Date.now()}`,
            price: 150.0,
            inventory: {
              create: {
                stockQuantity: 2, // ONLY 2 ITEMS
                reservedQuantity: 0,
                lowStockThreshold: 1
              }
            }
          }
        }
      },
      include: { variants: true }
    });

    checkoutVariantId = checkoutProduct.variants[0].id;
  });

  it('Strict Concurrency: 10 concurrent requests for 2 stock units must yield exactly 2 successes and 8 failures', async () => {
    // 10 simultaneous customers attempt to reserve 1 unit each at the exact same millisecond
    const concurrentRequests = Array.from({ length: 10 }, (_, i) =>
      inventoryService.reserveStock(testVariantId, 1, `CONCURR-ORDER-${i}`)
    );

    const results = await Promise.allSettled(concurrentRequests);

    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');

    // Exactly 2 must succeed because stock was 2
    assert.strictEqual(succeeded.length, 2);

    // Exactly 8 must fail gracefully with out-of-stock / insufficient stock
    assert.strictEqual(failed.length, 8);

    failed.forEach((failure) => {
      if (failure.status === 'rejected') {
        assert.ok(failure.reason.message.includes('Insufficient stock'));
      }
    });

    // Check database state: reservedQuantity must be exactly 2, available stock must be 0
    const finalInventory = await prisma.inventoryItem.findUnique({
      where: { variantId: testVariantId }
    });

    assert.strictEqual(finalInventory?.stockQuantity, 2);
    assert.strictEqual(finalInventory?.reservedQuantity, 2);

    const available = (finalInventory?.stockQuantity || 0) - (finalInventory?.reservedQuantity || 0);
    assert.strictEqual(available, 0);
  });

  it('Insufficient Stock: Rejecting reservation when requested quantity exceeds available', async () => {
    await assert.rejects(
      async () => {
        await inventoryService.reserveStock(testVariantId, 1, 'EXCESS-ORDER');
      },
      (err: Error) => {
        assert.ok(err.message.includes('Insufficient stock'));
        return true;
      }
    );
  });

  it('Atomic Rollback: Releasing a reservation restores available stock safely', async () => {
    // Release 1 reserved unit
    await inventoryService.releaseReservation(testVariantId, 1, 'TEST-CANCEL');

    const inventoryAfterRelease = await prisma.inventoryItem.findUnique({
      where: { variantId: testVariantId }
    });

    assert.strictEqual(inventoryAfterRelease?.reservedQuantity, 1);
    const available = (inventoryAfterRelease?.stockQuantity || 0) - (inventoryAfterRelease?.reservedQuantity || 0);
    assert.strictEqual(available, 1);

    // Now a new reservation of 1 unit must succeed
    const newReservation = await inventoryService.reserveStock(testVariantId, 1, 'RETRY-ORDER');
    assert.strictEqual(newReservation, true);
  });

  it('Commit Reservation: Commits reserved stock without double decrement', async () => {
    // Commit 1 reserved unit
    await inventoryService.commitReservation(testVariantId, 1, 'FULFILL-ORDER');

    const inventoryAfterCommit = await prisma.inventoryItem.findUnique({
      where: { variantId: testVariantId }
    });

    // Stock was 2, committed 1 -> stockQuantity is 1, reserved was 2 now 1
    assert.strictEqual(inventoryAfterCommit?.stockQuantity, 1);
    assert.strictEqual(inventoryAfterCommit?.reservedQuantity, 1);
  });

  it('Concurrent Checkouts: 5 concurrent checkouts for 2 in-stock items yield exactly 2 orders and 3 failures', async () => {
    // Create 5 separate carts with 1 item each
    const sessions = Array.from({ length: 5 }, (_, i) => `checkout_sess_${Date.now()}_${i}`);

    for (const sess of sessions) {
      await cartService.addItem(checkoutVariantId, 1, undefined, sess);
    }

    // Simultaneously checkout all 5 carts
    const checkoutPromises = sessions.map((sess, i) =>
      orderService.createOrderFromCart({
        sessionId: sess,
        deliveryType: 'STORE_PICKUP',
        paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
        customerEmail: `concurrent_buyer_${i}@test.local`,
        customerPhone: `+91987654320${i}`
      })
    );

    const checkoutResults = await Promise.allSettled(checkoutPromises);

    const succeeded = checkoutResults.filter((r) => r.status === 'fulfilled');
    const failed = checkoutResults.filter((r) => r.status === 'rejected');

    assert.strictEqual(succeeded.length, 2);
    assert.strictEqual(failed.length, 3);

    // Verify DB inventory: reservedQuantity should be 2, stockQuantity 2, available 0
    const inv = await prisma.inventoryItem.findUnique({
      where: { variantId: checkoutVariantId }
    });

    assert.strictEqual(inv?.stockQuantity, 2);
    assert.strictEqual(inv?.reservedQuantity, 2);
  });
});
