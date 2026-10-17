import { prisma } from '../../core/database/prisma.js';
import { recordAuditEvent } from '../../core/logging/audit.js';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface ProductFilters {
  search?: string;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  sortBy?: 'price_asc' | 'price_desc' | 'newest' | 'name';
  page?: number;
  limit?: number;
  includeInactive?: boolean;
}

export class ProductService {
  async listProducts(filters: ProductFilters = {}) {
    const {
      search,
      categoryId,
      minPrice,
      maxPrice,
      inStockOnly,
      sortBy = 'newest',
      page = 1,
      limit = 20,
      includeInactive = false
    } = filters;

    const where: any = {};

    if (!includeInactive) {
      where.isActive = true;
    }

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { description: { contains: search } },
        { sku: { contains: search } }
      ];
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      where.basePrice = {};
      if (minPrice !== undefined) where.basePrice.gte = minPrice;
      if (maxPrice !== undefined) where.basePrice.lte = maxPrice;
    }

    let orderBy: any = { createdAt: 'desc' };
    if (sortBy === 'price_asc') orderBy = { basePrice: 'asc' };
    if (sortBy === 'price_desc') orderBy = { basePrice: 'desc' };
    if (sortBy === 'name') orderBy = { name: 'asc' };

    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          category: { select: { id: true, name: true, slug: true } },
          variants: {
            include: {
              inventory: true
            }
          },
          reviews: {
            where: { isApproved: true },
            select: { rating: true }
          }
        },
        orderBy,
        skip,
        take: limit
      }),
      prisma.product.count({ where })
    ]);

    // Format products with stock status and average review rating
    const items = products.map((prod) => {
      let images: string[] = [];
      try {
        images = JSON.parse(prod.images);
      } catch {
        images = [];
      }

      let attributes: Record<string, unknown> = {};
      try {
        attributes = JSON.parse(prod.attributes);
      } catch {
        attributes = {};
      }

      const totalStock = prod.variants.reduce((acc, v) => acc + (v.inventory?.stockQuantity || 0), 0);
      const totalReserved = prod.variants.reduce((acc, v) => acc + (v.inventory?.reservedQuantity || 0), 0);
      const availableStock = Math.max(0, totalStock - totalReserved);

      const ratings = prod.reviews.map((r) => r.rating);
      const averageRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;

      return {
        id: prod.id,
        name: prod.name,
        slug: prod.slug,
        description: prod.description,
        basePrice: prod.basePrice,
        sku: prod.sku,
        category: prod.category,
        isActive: prod.isActive,
        images,
        attributes,
        availableStock,
        variantsCount: prod.variants.length,
        averageRating,
        reviewCount: ratings.length,
        variants: prod.variants.map((v) => ({
          id: v.id,
          sku: v.sku,
          name: v.name,
          price: v.price,
          compareAtPrice: v.compareAtPrice,
          options: JSON.parse(v.options || '{}'),
          stockQuantity: v.inventory?.stockQuantity || 0,
          reservedQuantity: v.inventory?.reservedQuantity || 0,
          availableQuantity: Math.max(0, (v.inventory?.stockQuantity || 0) - (v.inventory?.reservedQuantity || 0))
        }))
      };
    });

    const filteredItems = inStockOnly ? items.filter((p) => p.availableStock > 0) : items;

    return {
      items: filteredItems,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async getProductBySlug(slug: string) {
    const product = await prisma.product.findUnique({
      where: { slug },
      include: {
        category: true,
        variants: {
          include: {
            inventory: true
          }
        },
        reviews: {
          where: { isApproved: true },
          include: {
            user: { select: { id: true, name: true } }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!product) {
      throw new Error(`Product with slug '${slug}' not found`);
    }

    const images = JSON.parse(product.images || '[]');
    const attributes = JSON.parse(product.attributes || '{}');

    return {
      ...product,
      images,
      attributes,
      variants: product.variants.map((v) => ({
        id: v.id,
        sku: v.sku,
        name: v.name,
        price: v.price,
        compareAtPrice: v.compareAtPrice,
        options: JSON.parse(v.options || '{}'),
        stockQuantity: v.inventory?.stockQuantity || 0,
        reservedQuantity: v.inventory?.reservedQuantity || 0,
        availableQuantity: Math.max(0, (v.inventory?.stockQuantity || 0) - (v.inventory?.reservedQuantity || 0))
      }))
    };
  }

  async createProduct(data: any, creatorUserId?: string) {
    const slug = data.slug || slugify(data.name);

    return prisma.$transaction(async (tx) => {
      const existing = await tx.product.findFirst({
        where: { OR: [{ slug }, { sku: data.sku }] }
      });

      if (existing) {
        throw new Error(`A product with this slug (${slug}) or SKU (${data.sku}) already exists`);
      }

      const product = await tx.product.create({
        data: {
          name: data.name,
          slug,
          description: data.description,
          basePrice: data.basePrice,
          sku: data.sku,
          categoryId: data.categoryId || null,
          images: JSON.stringify(data.images || []),
          attributes: JSON.stringify(data.attributes || {})
        }
      });

      // Default master variant if none provided
      const variantsToCreate = data.variants && data.variants.length > 0
        ? data.variants
        : [
            {
              name: 'Default',
              sku: data.sku,
              price: data.basePrice,
              options: {},
              initialStock: 10,
              lowStockThreshold: 5
            }
          ];

      for (const v of variantsToCreate) {
        const variant = await tx.productVariant.create({
          data: {
            productId: product.id,
            sku: v.sku,
            name: v.name,
            price: v.price,
            compareAtPrice: v.compareAtPrice,
            options: JSON.stringify(v.options || {})
          }
        });

        await tx.inventoryItem.create({
          data: {
            variantId: variant.id,
            stockQuantity: v.initialStock || 0,
            reservedQuantity: 0,
            lowStockThreshold: v.lowStockThreshold || 5
          }
        });

        if (v.initialStock > 0) {
          await tx.inventoryLog.create({
            data: {
              variantId: variant.id,
              changeAmount: v.initialStock,
              previousStock: 0,
              newStock: v.initialStock,
              reason: 'INITIAL_STOCK',
              performedBy: creatorUserId || 'SYSTEM'
            }
          });
        }
      }

      if (creatorUserId) {
        await recordAuditEvent({
          userId: creatorUserId,
          action: 'PRODUCT_CREATED',
          entityType: 'Product',
          entityId: product.id,
          details: { name: product.name, sku: product.sku }
        });
      }

      return product;
    });
  }

  async updateProduct(id: string, data: any, updaterUserId?: string) {
    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.basePrice !== undefined) updateData.basePrice = data.basePrice;
    if (data.categoryId !== undefined) updateData.categoryId = data.categoryId;
    if (data.images !== undefined) updateData.images = JSON.stringify(data.images);
    if (data.attributes !== undefined) updateData.attributes = JSON.stringify(data.attributes);
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const product = await prisma.product.update({
      where: { id },
      data: updateData
    });

    if (updaterUserId) {
      await recordAuditEvent({
        userId: updaterUserId,
        action: 'PRODUCT_UPDATED',
        entityType: 'Product',
        entityId: id,
        details: updateData
      });
    }

    return product;
  }

  async deleteProduct(id: string, deleterUserId?: string) {
    const product = await prisma.product.delete({
      where: { id }
    });

    if (deleterUserId) {
      await recordAuditEvent({
        userId: deleterUserId,
        action: 'PRODUCT_DELETED',
        entityType: 'Product',
        entityId: id,
        details: { sku: product.sku }
      });
    }

    return product;
  }
}

export const productService = new ProductService();
