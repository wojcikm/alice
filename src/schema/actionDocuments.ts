import {sql, relations} from 'drizzle-orm';
import {text, integer, sqliteTable} from 'drizzle-orm/sqlite-core';
import {actions} from './action';
import {documents} from './document';

export const actionDocuments = sqliteTable('action_documents', {
  id: integer('id').primaryKey({autoIncrement: true}),
  action_uuid: text('action_uuid')
    .notNull()
    .references(() => actions.uuid),
  document_uuid: text('document_uuid')
    .notNull()
    .references(() => documents.uuid),
  created_at: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updated_at: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});

export const actionDocumentsRelations = relations(actionDocuments, ({one}) => ({
  action: one(actions, {
    fields: [actionDocuments.action_uuid],
    references: [actions.uuid]
  }),
  document: one(documents, {
    fields: [actionDocuments.document_uuid],
    references: [documents.uuid]
  })
}));

export type ActionDocument = typeof actionDocuments.$inferSelect;
export type NewActionDocument = typeof actionDocuments.$inferInsert;
