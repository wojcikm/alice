import { sql, relations } from "drizzle-orm";
import { text, integer, sqliteTable } from "drizzle-orm/sqlite-core";
import { conversations } from './conversation';
import { documents } from './document';

export const conversationDocuments = sqliteTable('conversation_documents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  conversation_uuid: text('conversation_uuid').notNull().references(() => conversations.uuid),
  document_uuid: text('document_uuid').notNull().references(() => documents.uuid),
  created_at: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updated_at: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

export const conversationDocumentsRelations = relations(conversationDocuments, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationDocuments.conversation_uuid],
    references: [conversations.uuid],
  }),
  document: one(documents, {
    fields: [conversationDocuments.document_uuid],
    references: [documents.uuid],
  })
}));

export type ConversationDocument = typeof conversationDocuments.$inferSelect;
export type NewConversationDocument = typeof conversationDocuments.$inferInsert;
