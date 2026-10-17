import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/core/database/prisma.js';

describe('Cart & Checkout Price Recalculation Tests', () => {
  let customerToken: string;
  let customerEmail: string;
  let testVariantId: string;
  let testProductId: string;
  const initialPrice = 500;
  const updatedPrice = 750;

  before(async () => {
    customerEmail = `price_check_${Date.now()}@algions.local`;
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Price Check Customer',
        email: customerEmail,
        password: 'Password@123'
      });
    customerToken = regRes.body.data.accessToken;

    // Create a dedicated product and variant for price change testing
    const category = await prisma.category.findFirst();
    const product = await prisma.product.create({
      data: {
        name: `Dynamic Pricing Test Product ${Date.now()}`,
        slug: `dyn-price-${Date.now()}`,
        description: 'Test product for checkout price recalculation',
        basePrice: initialPrice,
        sku: `PROD-DYN-${Date.now()}`,
        categoryId: category!.id,
        isActive: true,
        variants: {
          create: {
            name: 'Standard',
            sku: `DYN-SKU-${Date.now()}`,
            price: initialPrice,
            inventory: {
              create: {
                stockQuantity: 50,
                reservedQuantity: 0
              }
            }
          }
        }
      },
      include: { variants: true }
    });

    testProductId = product.id;
    testVariantId = product.variants[0].id;
  });

  it('Recalculates prices at checkout when variant price changed after cart creation', async () => {
    // 1. Customer adds 2 units to cart when price is ₹500
    const addRes = await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ variantId: testVariantId, quantity: 2 });
    assert.strictEqual(addRes.status, 200);
    assert.strictEqual(addRes.body.data.items[0].unitPrice, initialPrice);
    assert.strictEqual(addRes.body.data.subtotal, initialPrice * 2);

    // 2. Store changes variant price to ₹750 in database
    await prisma.productVariant.update({
      where: { id: testVariantId },
      data: { price: updatedPrice }
    });

    // 3. Customer checks out
    const checkoutRes = await request(app)
      .post('/api/orders/checkout')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        deliveryType: 'STORE_PICKUP',
        paymentMethod: 'CASH_ON_DELIVERY',
        customerEmail,
        customerPhone: '+919876543210'
      });

    assert.strictEqual(checkoutRes.status, 201);
    assert.strictEqual(checkoutRes.body.success, true);

    const order = checkoutRes.body.data;
    // 4. Assert that authoritative live price was used
    assert.strictEqual(order.items[0].unitPrice, updatedPrice);
    assert.strictEqual(order.items[0].totalPrice, updatedPrice * 2);
    assert.strictEqual(order.subtotal, updatedPrice * 2);
  });

  it('Rejects checkout if product is deactivated between cart addition and checkout', async () => {
    // Add item to cart
    await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ variantId: testVariantId, quantity: 1 });

    // Deactivate the product
    await prisma.product.update({
      where: { id: testProductId },
      data: { isActive: false }
    });

    // Attempt checkout
    const checkoutRes = await request(app)
      .post('/api/orders/checkout')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        deliveryType: 'STORE_PICKUP',
        paymentMethod: 'CASH_ON_DELIVERY',
        customerEmail,
        customerPhone: '+919876543210'
      });

    assert.strictEqual(checkoutRes.status, 400);
    assert.strictEqual(checkoutRes.body.success, false);
    assert.ok(checkoutRes.body.error.includes('no longer active or available'));
  });
});
