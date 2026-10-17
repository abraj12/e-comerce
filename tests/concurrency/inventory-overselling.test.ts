import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../src/core/database/prisma.js';
import { inventoryService } from '../../src/modules/inventory/inventory.service.js';

describe('Concurrency & Inventory Overselling Protection Tests', () => {
  let testVariantId: string;

  before(async () => {
    // Create an isolated product variant for high-concurrency test
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
});
