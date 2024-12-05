import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql, relations } from 'drizzle-orm';
import { conversations } from './conversation';

export const users = sqliteTable('users', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  uuid: text('uuid', { length: 36 }).notNull().unique(),
  name: text('name'),
  email: text('email').unique(),
  token: text('token').unique(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`CURRENT_TIMESTAMP`),
  context: text('context'),
  environment: text('environment', { mode: 'json' }),
  googleAccessToken: text('google_access_token'),
  googleRefreshToken: text('google_refresh_token'),
  googleTokenExpiry: integer('google_token_expiry', { mode: 'timestamp' }),
  spotifyAccessToken: text('spotify_access_token'),
  spotifyRefreshToken: text('spotify_refresh_token'),
  spotifyTokenExpiry: integer('spotify_token_expiry', { mode: 'timestamp' }),
});

export const usersRelations = relations(users, ({ many }) => ({
  conversations: many(conversations)
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
