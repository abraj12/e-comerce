import { Request, Response } from 'express';
import { categoryService } from './category.service.js';

export class CategoryController {
  async list(_req: Request, res: Response): Promise<void> {
    try {
      const categories = await categoryService.listCategories();
      res.json({ success: true, data: categories });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }

  async getBySlug(req: Request, res: Response): Promise<void> {
    try {
      const category = await categoryService.getCategoryBySlug(req.params.slug as string);
      res.json({ success: true, data: category });
    } catch (error) {
      res.status(404).json({ success: false, error: (error as Error).message });
    }
  }

  async create(req: Request, res: Response): Promise<void> {
    try {
      const category = await categoryService.createCategory(req.body);
      res.status(201).json({ success: true, data: category });
    } catch (error) {
      res.status(400).json({ success: false, error: (error as Error).message });
    }
  }

  async update(req: Request, res: Response): Promise<void> {
    try {
      const category = await categoryService.updateCategory(req.params.id as string, req.body);
      res.json({ success: true, data: category });
    } catch (error) {
      res.status(400).json({ success: false, error: (error as Error).message });
    }
  }

  async delete(req: Request, res: Response): Promise<void> {
    try {
      await categoryService.deleteCategory(req.params.id as string);
      res.json({ success: true, message: 'Category deleted successfully' });
    } catch (error) {
      res.status(400).json({ success: false, error: (error as Error).message });
    }
  }
}

export const categoryController = new CategoryController();
