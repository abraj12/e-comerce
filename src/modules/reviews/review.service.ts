import { prisma } from '../../core/database/prisma.js';
import { z } from 'zod';

export const createReviewSchema = z.object({
  productId: z.string().uuid(),
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().optional(),
  comment: z.string().min(3)
});

export class ReviewService {
  async listReviewsForProduct(productId: string) {
    return prisma.review.findMany({
      where: { productId, isApproved: true },
      include: {
        user: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async createReview(userId: string, data: { productId: string; rating: number; title?: string; comment: string }) {
    return prisma.review.create({
      data: {
        userId,
        productId: data.productId,
        rating: data.rating,
        title: data.title || null,
        comment: data.comment,
        isApproved: true // Auto-approve or moderate
      }
    });
  }

  async moderateReview(id: string, isApproved: boolean) {
    return prisma.review.update({
      where: { id },
      data: { isApproved }
    });
  }
}

export const reviewService = new ReviewService();
