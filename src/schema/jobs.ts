import { sql, relations } from "drizzle-orm";
import { text, integer, sqliteTable } from "drizzle-orm/sqlite-core";
import { tasks } from './task';

export const jobs = sqliteTable('jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  uuid: text('uuid').notNull().unique(),
  task_uuid: text('task_uuid')
    .notNull()
    .references(() => tasks.uuid),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'cron' | 'scheduled' | 'recurring'
  schedule: text('schedule').notNull(), // cron expression or ISO date
  status: text('status')
    .notNull()
    .default('pending'), // 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  last_run: text('last_run'),
  next_run: text('next_run'),
  result: text('result', { mode: 'json' }),
  metadata: text('metadata', { mode: 'json' }),
  created_at: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updated_at: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});

export const jobsRelations = relations(jobs, ({ one }) => ({
  task: one(tasks, {
    fields: [jobs.task_uuid],
    references: [tasks.uuid]
  })
}));

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;

/**
 * Example metadata structure:
 * {
 *   retry_count: number,
 *   max_retries: number,
 *   timeout: number,
 *   priority: number,
 *   dependencies: string[], // task_uuids
 *   notifications: {
 *     on_success: boolean,
 *     on_failure: boolean,
 *     channels: string[]
 *   },
 * }
 */
