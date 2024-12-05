import { sql, relations } from "drizzle-orm";
import { text, integer, sqliteTable } from "drizzle-orm/sqlite-core";
import { conversations } from './conversation';
import { memories } from './memory';

export const conversationMemories = sqliteTable('conversation_memories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  conversation_uuid: text('conversation_uuid').notNull().references(() => conversations.uuid),
  memory_uuid: text('memory_uuid').notNull().references(() => memories.uuid),
  created_at: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updated_at: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

export const conversationMemoriesRelations = relations(conversationMemories, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationMemories.conversation_uuid],
    references: [conversations.uuid],
  }),
  memory: one(memories, {
    fields: [conversationMemories.memory_uuid],
    references: [memories.uuid],
  })
}));

export type ConversationMemory = typeof conversationMemories.$inferSelect;
export type NewConversationMemory = typeof conversationMemories.$inferInsert; 