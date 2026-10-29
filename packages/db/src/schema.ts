import type { DeliveryErrorDetail } from '@phat-tin/shared';
import { relations, sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    email: text('email').notNull(),
    displayName: text('display_name').notNull(),
    role: text('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('users_email_unique').on(table.email),
    check('users_role_check', sql`${table.role} in ('admin', 'editor', 'viewer')`),
  ],
);

export const recipientGroups = pgTable(
  'recipient_groups',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    emailAddress: text('email_address').notNull(),
    memberCount: integer('member_count').notNull(),
    isActive: boolean('is_active').notNull().default(true),
  },
  (table) => [uniqueIndex('recipient_groups_email_unique').on(table.emailAddress)],
);

/**
 * `start_at` is a local wall-clock timestamp in `timezone` (no offset stored).
 * `next_run_at` is the next send instant in UTC.
 * `rrule` is the RFC 5545 string from the shared recurrence helper.
 */
export const announcements = pgTable(
  'announcements',
  {
    id: uuid('id').primaryKey(),
    title: text('title').notNull(),
    bodyHtml: text('body_html').notNull(),
    bodyText: text('body_text').notNull(),
    timezone: text('timezone').notNull().default('Asia/Ho_Chi_Minh'),
    startAt: timestamp('start_at', { withTimezone: false, mode: 'string' }).notNull(),
    frequency: text('frequency').notNull(),
    untilDate: date('until_date', { mode: 'string' }),
    rrule: text('rrule'),
    /** Addresses typed by hand. Sent together with the selected groups. */
    recipientEmails: text('recipient_emails')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    ccEmails: text('cc_emails')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    bccEmails: text('bcc_emails')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    isActive: boolean('is_active').notNull().default(true),
    nextRunAt: timestamp('next_run_at', { withTimezone: true, mode: 'date' }),
    version: integer('version').notNull().default(1),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    updatedBy: uuid('updated_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    check(
      'announcements_frequency_check',
      sql`${table.frequency} in ('none', 'daily', 'weekdays', 'weekly', 'monthly', 'yearly')`,
    ),
    index('announcements_due_idx')
      .on(table.nextRunAt)
      .where(sql`${table.isActive} = true AND ${table.deletedAt} IS NULL`),
  ],
);

export const announcementGroups = pgTable(
  'announcement_groups',
  {
    announcementId: uuid('announcement_id')
      .notNull()
      .references(() => announcements.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id')
      .notNull()
      .references(() => recipientGroups.id),
  },
  (table) => [primaryKey({ columns: [table.announcementId, table.groupId] })],
);

export const deliveries = pgTable(
  'deliveries',
  {
    id: uuid('id').primaryKey(),
    announcementId: uuid('announcement_id')
      .notNull()
      .references(() => announcements.id),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true, mode: 'date' }).notNull(),
    status: text('status').notNull(),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    /** SMTP code and server reply for each failed attempt. Never holds credentials or the body. */
    errorDetail: jsonb('error_detail').$type<DeliveryErrorDetail>(),
    providerMessageId: text('provider_message_id'),
    recipientCount: integer('recipient_count').notNull().default(0),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }),
    /** Set on a manual resend. Points at the failed delivery it replaces. */
    retryOf: uuid('retry_of').references((): AnyPgColumn => deliveries.id),
  },
  (table) => [
    index('deliveries_retry_of_idx').on(table.retryOf),
    uniqueIndex('deliveries_announcement_scheduled_unique').on(
      table.announcementId,
      table.scheduledFor,
    ),
    check(
      'deliveries_status_check',
      sql`${table.status} in ('queued', 'sending', 'sent', 'failed', 'skipped')`,
    ),
    index('deliveries_scheduled_for_idx').on(table.scheduledFor),
  ],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: uuid('actor_id').references(() => users.id),
    action: text('action').notNull(),
    announcementId: uuid('announcement_id').references(() => announcements.id),
    detail: jsonb('detail'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'audit_log_action_check',
      sql`${table.action} in ('create', 'edit', 'toggle', 'delete', 'test_send', 'retry')`,
    ),
    index('audit_log_announcement_idx').on(table.announcementId),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  announcements: many(announcements),
}));

export const announcementsRelations = relations(announcements, ({ many, one }) => ({
  groups: many(announcementGroups),
  creator: one(users, { fields: [announcements.createdBy], references: [users.id] }),
}));

export const announcementGroupsRelations = relations(announcementGroups, ({ one }) => ({
  announcement: one(announcements, {
    fields: [announcementGroups.announcementId],
    references: [announcements.id],
  }),
  group: one(recipientGroups, {
    fields: [announcementGroups.groupId],
    references: [recipientGroups.id],
  }),
}));

export const recipientGroupsRelations = relations(recipientGroups, ({ many }) => ({
  announcements: many(announcementGroups),
}));

export const deliveriesRelations = relations(deliveries, ({ one }) => ({
  announcement: one(announcements, {
    fields: [deliveries.announcementId],
    references: [announcements.id],
  }),
}));

/** Operational row written by the worker tick. Not part of the announcement domain. */
export const schedulerState = pgTable('scheduler_state', {
  id: text('id').primaryKey(),
  lastTickAt: timestamp('last_tick_at', { withTimezone: true, mode: 'date' }),
});
