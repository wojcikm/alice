import {sql, relations} from 'drizzle-orm';
import {text, integer, sqliteTable} from 'drizzle-orm/sqlite-core';
import {tasks} from './task';
import {tools} from './tool';
import {actionDocuments} from './actionDocuments';

export const actions = sqliteTable('actions', {
  id: integer('id').primaryKey({autoIncrement: true}),
  uuid: text('uuid').notNull().unique(),
  task_uuid: text('task_uuid')
    .notNull()
    .references(() => tasks.uuid),
  tool_uuid: text('tool_uuid')
    .notNull()
    .references(() => tools.uuid),
  name: text('name').notNull(),
  type: text('type').notNull(), // sync / async
  payload: text('payload', {mode: 'json'}),
  result: text('result', {mode: 'json'}),
  sequence: integer('sequence'),
  status: text('status').default('pending'),
  created_at: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updated_at: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});

export const actionsRelations = relations(actions, ({one, many}) => ({
  task: one(tasks, {
    fields: [actions.task_uuid],
    references: [tasks.uuid]
  }),
  tool: one(tools, {
    fields: [actions.tool_uuid],
    references: [tools.uuid]
  }),
  actionDocuments: many(actionDocuments)
}));

export type Action = typeof actions.$inferSelect;
export type NewAction = typeof actions.$inferInsert;
