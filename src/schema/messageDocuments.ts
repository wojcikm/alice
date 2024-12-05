import { sql, relations } from "drizzle-orm";
import { text, integer, sqliteTable } from "drizzle-orm/sqlite-core";
import { messages } from './message';
import { documents } from './document';

export const messageDocuments = sqliteTable('message_documents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  message_uuid: text('message_uuid').notNull().references(() => messages.uuid),
  document_uuid: text('document_uuid').notNull().references(() => documents.uuid),
  created_at: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updated_at: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

export const messageDocumentsRelations = relations(messageDocuments, ({ one }) => ({
  message: one(messages, {
    fields: [messageDocuments.message_uuid],
    references: [messages.uuid],
  }),
  document: one(documents, {
    fields: [messageDocuments.document_uuid],
    references: [documents.uuid],
  })
}));

export type MessageDocument = typeof messageDocuments.$inferSelect;
export type NewMessageDocument = typeof messageDocuments.$inferInsert;
