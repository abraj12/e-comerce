import { Request, Response } from 'express';
import { productService } from './product.service.js';

export class ProductController {
  async list(req: Request, res: Response): Promise<void> {
    try {
      const result = await productService.listProducts(req.query as any);
      res.json({ success: true, ...result });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }

  async getBySlug(req: Request, res: Response): Promise<void> {
    try {
      const product = await productService.getProductBySlug(req.params.slug as string);
      res.json({ success: true, data: product });
    } catch (error) {
      res.status(404).json({ success: false, error: (error as Error).message });
    }
  }

  async create(req: Request, res: Response): Promise<void> {
    try {
      const product = await productService.createProduct(req.body, req.user?.userId);
      res.status(201).json({ success: true, data: product });
    } catch (error) {
      res.status(400).json({ success: false, error: (error as Error).message });
    }
  }

  async update(req: Request, res: Response): Promise<void> {
    try {
      const product = await productService.updateProduct(req.params.id as string, req.body, req.user?.userId);
      res.json({ success: true, data: product });
    } catch (error) {
      res.status(400).json({ success: false, error: (error as Error).message });
    }
  }

  async delete(req: Request, res: Response): Promise<void> {
    try {
      await productService.deleteProduct(req.params.id as string, req.user?.userId);
      res.json({ success: true, message: 'Product deleted successfully' });
    } catch (error) {
      res.status(400).json({ success: false, error: (error as Error).message });
    }
  }

  async uploadImage(req: Request, res: Response): Promise<void> {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No image file uploaded' });
      return;
    }

    const imageUrl = `/uploads/${req.file.filename}`;
    res.status(201).json({
      success: true,
      data: {
        filename: req.file.filename,
        url: imageUrl,
        size: req.file.size,
        mimetype: req.file.mimetype
      }
    });
  }
}

export const productController = new ProductController();
