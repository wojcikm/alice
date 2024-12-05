import {sql, relations} from 'drizzle-orm';
import {text, integer, sqliteTable} from 'drizzle-orm/sqlite-core';
import {conversations} from './conversation';
import {actions} from './action';
import {taskDocuments} from './taskDocuments';

export const tasks = sqliteTable('tasks', {
  id: integer('id').primaryKey({autoIncrement: true}),
  uuid: text('uuid').notNull().unique(),
  conversation_uuid: text('conversation_uuid')
    .notNull()
    .references(() => conversations.uuid),
  name: text('name').notNull(),
  type: text('type').notNull(),
  status: text('status').notNull().default('pending'),
  description: text('description'),
  scheduled_for: text('scheduled_for'),
  completed_at: text('completed_at'),
  result: text('result'),
  created_at: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updated_at: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`)
});

export const tasksRelations = relations(tasks, ({one, many}) => ({
  conversation: one(conversations, {
    fields: [tasks.conversation_uuid],
    references: [conversations.uuid]
  }),
  actions: many(actions),
  taskDocuments: many(taskDocuments)
}));

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
