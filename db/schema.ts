import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    message: text('message').notNull(),
    slot: integer('slot').notNull().unique(),
    rotation: integer('rotation').notNull(),
    color: text('color').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('messages_created_at_idx').on(table.createdAt)],
);
