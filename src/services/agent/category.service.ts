import db from '../../database/db';
import {categories, type Category} from '../../schema/category';
import { and, eq } from 'drizzle-orm';

export const categoryService = {
  async findAll(): Promise<Category[]> {
    return await db.select().from(categories);
  },

  async findByNameAndSubcategory(name: string, subcategory: string): Promise<Category | undefined> {
    const [category] = await db
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.name, name.toLowerCase()),
          eq(categories.subcategory, subcategory.toLowerCase())
        )
      );
    
    if (!category) {
      throw new Error(`Category not found: ${name}/${subcategory}`);
    }

    return category;
  },

  async findByUuid(uuid: string): Promise<Category | undefined> {
    const [category] = await db
      .select()
      .from(categories)
      .where(eq(categories.uuid, uuid));
    
    if (!category) {
      throw new Error(`Category not found with UUID: ${uuid}`);
    }

    return category;
  }
};
