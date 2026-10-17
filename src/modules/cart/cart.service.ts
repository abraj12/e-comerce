import { prisma } from '../../core/database/prisma.js';
import { promotionService } from '../promotions/promotion.service.js';
import { env } from '../../core/config/env.js';

export class CartService {
  async getOrCreateCart(customerId?: string, sessionId?: string) {
    if (!customerId && !sessionId) {
      throw new Error('Either customerId or sessionId must be provided for cart identification');
    }

    let cart = await prisma.cart.findFirst({
      where: customerId ? { customerId } : { sessionId }
    });

    if (!cart) {
      cart = await prisma.cart.create({
        data: {
          customerId: customerId || null,
          sessionId: !customerId ? sessionId : null
        }
      });
    }

    return cart;
  }

  async getCart(customerId?: string, sessionId?: string) {
    const cart = await this.getOrCreateCart(customerId, sessionId);

    const fullCart = await prisma.cart.findUnique({
      where: { id: cart.id },
      include: {
        items: {
          include: {
            variant: {
              include: {
                product: { select: { id: true, name: true, slug: true, images: true } },
                inventory: true
              }
            }
          }
        }
      }
    });

    if (!fullCart) {
      throw new Error('Cart not found');
    }

    // Format items and compute subtotal
    let subtotal = 0;
    const items = fullCart.items.map((item) => {
      const itemTotal = item.quantity * item.unitPrice;
      subtotal += itemTotal;

      let images: string[] = [];
      try {
        images = JSON.parse(item.variant.product.images);
      } catch {
        images = [];
      }

      const availableStock = Math.max(
        0,
        (item.variant.inventory?.stockQuantity || 0) - (item.variant.inventory?.reservedQuantity || 0)
      );

      return {
        id: item.id,
        variantId: item.variantId,
        productName: item.variant.product.name,
        productSlug: item.variant.product.slug,
        variantName: item.variant.name,
        sku: item.variant.sku,
        image: images[0] || null,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        itemTotal: Number(itemTotal.toFixed(2)),
        availableStock
      };
    });

    let discountAmount = 0;
    let couponDetails: any = null;

    if (fullCart.couponCode && subtotal > 0) {
      try {
        couponDetails = await promotionService.validateCoupon(fullCart.couponCode, subtotal);
        discountAmount = couponDetails.discountAmount;
      } catch {
        // Invalidate invalid coupon
        await prisma.cart.update({
          where: { id: fullCart.id },
          data: { couponCode: null }
        });
      }
    }

    const discountedSubtotal = Math.max(0, subtotal - discountAmount);
    const taxRate = env.TAX_RATE_PERCENTAGE / 100;
    const taxAmount = Number((discountedSubtotal * taxRate).toFixed(2));
    const totalAmount = Number((discountedSubtotal + taxAmount).toFixed(2));

    return {
      cartId: fullCart.id,
      items,
      itemCount: items.reduce((acc, i) => acc + i.quantity, 0),
      subtotal: Number(subtotal.toFixed(2)),
      discountAmount,
      couponCode: fullCart.couponCode,
      couponDetails,
      taxAmount,
      totalAmount
    };
  }

  async addItem(variantId: string, quantity: number, customerId?: string, sessionId?: string) {
    if (quantity <= 0) {
      throw new Error('Item quantity must be at least 1');
    }

    const cart = await this.getOrCreateCart(customerId, sessionId);

    // Validate variant and available stock
    const variant = await prisma.productVariant.findUnique({
      where: { id: variantId },
      include: {
        inventory: true,
        product: true
      }
    });

    if (!variant || !variant.product.isActive) {
      throw new Error('Product variant is not available');
    }

    const availableStock = Math.max(
      0,
      (variant.inventory?.stockQuantity || 0) - (variant.inventory?.reservedQuantity || 0)
    );

    const existingItem = await prisma.cartItem.findUnique({
      where: {
        cartId_variantId: {
          cartId: cart.id,
          variantId
        }
      }
    });

    const targetQuantity = (existingItem?.quantity || 0) + quantity;

    if (targetQuantity > availableStock) {
      throw new Error(
        `Cannot add ${quantity} item(s). Only ${availableStock} units available in stock (already in cart: ${existingItem?.quantity || 0})`
      );
    }

    if (existingItem) {
      await prisma.cartItem.update({
        where: { id: existingItem.id },
        data: {
          quantity: targetQuantity,
          unitPrice: variant.price
        }
      });
    } else {
      await prisma.cartItem.create({
        data: {
          cartId: cart.id,
          variantId,
          quantity,
          unitPrice: variant.price
        }
      });
    }

    return this.getCart(customerId, sessionId);
  }

  /**
   * Updates cart item quantity with strict cart ownership enforcement.
   * Prevents manipulation of another user's cart item ID.
   */
  async updateItemQuantity(itemId: string, quantity: number, customerId?: string, sessionId?: string) {
    if (quantity <= 0) {
      throw new Error('Quantity must be greater than zero');
    }

    const userCart = await this.getOrCreateCart(customerId, sessionId);

    // Enforce ownership: query requires both itemId AND user's cartId
    const item = await prisma.cartItem.findFirst({
      where: {
        id: itemId,
        cartId: userCart.id
      },
      include: {
        variant: {
          include: {
            inventory: true,
            product: true
          }
        }
      }
    });

    if (!item) {
      throw new Error('Cart item not found or does not belong to your cart');
    }

    if (!item.variant.product.isActive) {
      throw new Error('Product is no longer available');
    }

    const availableStock = Math.max(
      0,
      (item.variant.inventory?.stockQuantity || 0) - (item.variant.inventory?.reservedQuantity || 0)
    );

    if (quantity > availableStock) {
      throw new Error(`Requested quantity (${quantity}) exceeds available stock (${availableStock})`);
    }

    await prisma.cartItem.update({
      where: { id: item.id },
      data: { quantity }
    });

    return this.getCart(customerId, sessionId);
  }

  /**
   * Removes cart item with strict cart ownership enforcement.
   */
  async removeItem(itemId: string, customerId?: string, sessionId?: string) {
    const userCart = await this.getOrCreateCart(customerId, sessionId);

    const result = await prisma.cartItem.deleteMany({
      where: {
        id: itemId,
        cartId: userCart.id
      }
    });

    if (result.count === 0) {
      throw new Error('Cart item not found or does not belong to your cart');
    }

    return this.getCart(customerId, sessionId);
  }

  async applyCoupon(couponCode: string, customerId?: string, sessionId?: string) {
    const cart = await this.getOrCreateCart(customerId, sessionId);
    const cartDetails = await this.getCart(customerId, sessionId);

    if (cartDetails.subtotal <= 0) {
      throw new Error('Cannot apply coupon to an empty cart');
    }

    // Validate coupon
    await promotionService.validateCoupon(couponCode, cartDetails.subtotal);

    await prisma.cart.update({
      where: { id: cart.id },
      data: { couponCode: couponCode.trim().toUpperCase() }
    });

    return this.getCart(customerId, sessionId);
  }

  async removeCoupon(customerId?: string, sessionId?: string) {
    const cart = await this.getOrCreateCart(customerId, sessionId);

    await prisma.cart.update({
      where: { id: cart.id },
      data: { couponCode: null }
    });

    return this.getCart(customerId, sessionId);
  }

  async clearCart(cartId: string) {
    await prisma.cartItem.deleteMany({ where: { cartId } });
    await prisma.cart.update({
      where: { id: cartId },
      data: { couponCode: null }
    });
  }
}

export const cartService = new CartService();
