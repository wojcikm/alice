import {sqliteTable, text, integer} from 'drizzle-orm/sqlite-core';
import {sql, relations} from 'drizzle-orm';
import {conversations} from './conversation';
import {messageDocuments} from './messageDocuments';

export const messages = sqliteTable('messages', {
  id: integer('id').primaryKey({autoIncrement: true}),
  uuid: text('uuid').notNull().unique(),
  conversation_uuid: text('conversation_uuid').references(() => conversations.uuid),
  role: text('role', {enum: ['system', 'user', 'assistant', 'tool']}).notNull(),
  content_type: text('content_type', {enum: ['text', 'multi_part']}).notNull(),
  content: text('content'),
  multipart: text('multipart', {mode: 'json'}),
  created_at: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updated_at: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});

export const messagesRelations = relations(messages, ({one, many}) => ({
  conversation: one(conversations, {
    fields: [messages.conversation_uuid],
    references: [conversations.uuid]
  }),
  documents: many(messageDocuments)
}));

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

/**
 multipart 
 [
    {
      type: "text",
      text: "Here are the photos from the inspection. What issues can you identify?"
    },
    {
      type: "image",
      image: "https://example.com/inspection-1.jpg",
      mimeType: "image/jpeg"
    },
    {
      type: "image",
      image: "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
      mimeType: "image/jpeg"
    },
    {
      type: "image",
      image: "https://example.com/inspection-3.jpg",
      mimeType: "image/jpeg"
    }
  ]
 */
