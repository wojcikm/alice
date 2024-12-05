import {sql, relations} from 'drizzle-orm';
import {text, integer, sqliteTable} from 'drizzle-orm/sqlite-core';
import {users} from './user';
import {messages} from './message';
import {conversationDocuments} from './conversationDocuments';
import {conversationMemories} from './conversationMemories';

export const conversations = sqliteTable('conversations', {
  id: integer('id').primaryKey({autoIncrement: true}),
  uuid: text('uuid').notNull().unique(),
  user_id: text('user_id').references(() => users.uuid),
  name: text('name'),
  status: text('status').default('active'),
  created_at: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updated_at: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});

export const conversationsRelations = relations(conversations, ({one, many}) => ({
  user: one(users),
  messages: many(messages),
  conversationDocuments: many(conversationDocuments),
  conversationMemories: many(conversationMemories)
}));

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
