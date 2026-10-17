import { Router, Request, Response } from 'express';
import { reviewService, createReviewSchema } from './review.service.js';
import { validate } from '../../core/validation/validator.js';
import { authenticate } from '../../core/authentication/middleware.js';
import { authorize } from '../../core/authorization/guard.js';

export const reviewRouter = Router();

// Public: Get reviews for a product
reviewRouter.get('/product/:productId', async (req: Request, res: Response) => {
  try {
    const reviews = await reviewService.listReviewsForProduct(req.params.productId as string);
    res.json({ success: true, data: reviews });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Protected: Submit a review (Customer)
reviewRouter.post(
  '/',
  authenticate,
  validate({ body: createReviewSchema }),
  async (req: Request, res: Response) => {
    try {
      const review = await reviewService.createReview(req.user!.userId, req.body);
      res.status(201).json({ success: true, data: review });
    } catch (error) {
      res.status(400).json({ success: false, error: (error as Error).message });
    }
  }
);

// Protected: Moderate a review (Manager / Admin)
reviewRouter.patch(
  '/:id/moderate',
  authenticate,
  authorize('reviews', 'write'),
  async (req: Request, res: Response) => {
    try {
      const review = await reviewService.moderateReview(req.params.id as string, req.body.isApproved);
      res.json({ success: true, data: review });
    } catch (error) {
      res.status(400).json({ success: false, error: (error as Error).message });
    }
  }
);
