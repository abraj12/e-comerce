import { prisma } from '../../core/database/prisma.js';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export class CategoryService {
  async listCategories(includeInactive = false) {
    return prisma.category.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: {
        children: {
          where: includeInactive ? {} : { isActive: true }
        },
        _count: {
          select: { products: true }
        }
      },
      orderBy: { name: 'asc' }
    });
  }

  async getCategoryBySlug(slug: string) {
    const category = await prisma.category.findUnique({
      where: { slug },
      include: {
        children: true,
        parent: true,
        products: {
          where: { isActive: true },
          include: { variants: true }
        }
      }
    });

    if (!category) {
      throw new Error(`Category with slug '${slug}' not found`);
    }

    return category;
  }

  async createCategory(data: { name: string; slug?: string; description?: string; parentId?: string | null }) {
    const slug = data.slug || slugify(data.name);
    const existing = await prisma.category.findUnique({ where: { slug } });
    if (existing) {
      throw new Error(`Category slug '${slug}' is already in use`);
    }

    return prisma.category.create({
      data: {
        name: data.name,
        slug,
        description: data.description,
        parentId: data.parentId || null
      }
    });
  }

  async updateCategory(id: string, data: { name?: string; description?: string | null; parentId?: string | null; isActive?: boolean }) {
    return prisma.category.update({
      where: { id },
      data
    });
  }

  async deleteCategory(id: string) {
    return prisma.category.delete({
      where: { id }
    });
  }
}

export const categoryService = new CategoryService();
