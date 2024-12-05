import { sql, relations } from "drizzle-orm";
import { text, integer, sqliteTable } from "drizzle-orm/sqlite-core";
import { tasks } from './task';
import { documents } from './document';

export const taskDocuments = sqliteTable('task_documents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  task_uuid: text('task_uuid').notNull().references(() => tasks.uuid),
  document_uuid: text('document_uuid').notNull().references(() => documents.uuid),
  created_at: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updated_at: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

export const taskDocumentsRelations = relations(taskDocuments, ({ one }) => ({
  task: one(tasks, {
    fields: [taskDocuments.task_uuid],
    references: [tasks.uuid],
  }),
  document: one(documents, {
    fields: [taskDocuments.document_uuid],
    references: [documents.uuid],
  })
}));

export type TaskDocument = typeof taskDocuments.$inferSelect;
export type NewTaskDocument = typeof taskDocuments.$inferInsert; 