import {sql, relations} from 'drizzle-orm';
import {text, integer, sqliteTable} from 'drizzle-orm/sqlite-core';
import {memories} from './memory';

export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({autoIncrement: true}),
  uuid: text('uuid', {length: 36}).notNull().unique(),
  name: text('name').notNull(),
  subcategory: text('subcategory'),
  description: text('description'),
  created_at: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updated_at: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});

export const categoriesRelations = relations(categories, ({many}) => ({
  memories: many(memories)
}));

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
