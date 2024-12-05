import { relations, sql } from "drizzle-orm";
import { text, integer, sqliteTable } from "drizzle-orm/sqlite-core";
import { documents } from './document';
import { categories } from './category';
import { conversationMemories } from './conversationMemories';
import { vectorService } from '../services/common/vector.service';
import { embedding } from "../services/common/llm.service";
import { v4 as uuidv4 } from 'uuid';

export const memories = sqliteTable('memories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  uuid: text('uuid', { length: 36 }).notNull().unique(),
  name: text('name').notNull(),
  category_uuid: text('category_uuid').notNull().references(() => categories.uuid),
  document_uuid: text('document_uuid').notNull().references(() => documents.uuid),
  created_at: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updated_at: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

export const memoriesRelations = relations(memories, ({ one, many }) => ({
  document: one(documents, {
    fields: [memories.document_uuid],
    references: [documents.uuid],
  }),
  category: one(categories, {
    fields: [memories.category_uuid],
    references: [categories.uuid],
  }),
  conversationMemories: many(conversationMemories)
}));

export type Memory = typeof memories.$inferSelect;
export type NewMemory = typeof memories.$inferInsert;
