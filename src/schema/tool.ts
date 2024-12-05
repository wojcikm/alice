import { sql, relations } from "drizzle-orm";
import { text, integer, sqliteTable } from "drizzle-orm/sqlite-core";
import { tasks } from './task';
import { actions } from './action';

export const tools = sqliteTable('tools', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  uuid: text('uuid').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  instruction: text('instruction'),
  created_at: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updated_at: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

export const toolsRelations = relations(tools, ({ many }) => ({
  tasks: many(tasks),
  actions: many(actions)
}));

export type Tool = typeof tools.$inferSelect;
export type NewTool = typeof tools.$inferInsert;
