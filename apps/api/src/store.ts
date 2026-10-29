import {
  announcementGroups,
  announcements,
  auditLog,
  deliveries,
  recipientGroups,
  type AppDatabase,
} from '@phat-tin/db';
import {
  APP_TIMEZONE,
  RETRY_CHANNEL,
  buildRrule,
  localToUtc,
  nextRunAt,
  type AnnouncementUpdate,
  type AnnouncementWrite,
  type DeliveryListQuery,
  type Frequency,
} from '@phat-tin/shared';
import { and, desc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import type { Actor } from './auth.js';
import { assertCanEdit, assertCanWrite } from './auth.js';
import { prepareBody } from './body.js';
import type { ApiEnv } from './env.js';
import { HttpError } from './http.js';
import { sendToUser } from './mail.js';

const announcementWithGroups = {
  groups: { with: { group: true } },
} as const;

export async function listAnnouncements(
  db: AppDatabase,
  query: { status: 'all' | 'on' | 'off'; q?: string; sort: 'next' | 'title' },
) {
  const rows = await db.query.announcements.findMany({
    where: isNull(announcements.deletedAt),
    with: announcementWithGroups,
  });
  const needle = query.q?.toLocaleLowerCase('vi');
  const filtered = rows.filter((row) => {
    if (query.status === 'on' && !row.isActive) return false;
    if (query.status === 'off' && row.isActive) return false;
    if (!needle) return true;
    const names = row.groups.map((link) => link.group?.name ?? '');
    return [row.title, ...names, ...row.recipientEmails, ...row.ccEmails, ...row.bccEmails]
      .join('\n')
      .toLocaleLowerCase('vi')
      .includes(needle);
  });
  filtered.sort((left, right) => {
    if (query.sort === 'title') return left.title.localeCompare(right.title, 'vi');
    if (left.isActive !== right.isActive) return left.isActive ? -1 : 1;
    return (
      (left.nextRunAt?.getTime() ?? Number.POSITIVE_INFINITY) -
      (right.nextRunAt?.getTime() ?? Number.POSITIVE_INFINITY)
    );
  });
  return filtered.map(toAnnouncement);
}

export async function getAnnouncement(db: AppDatabase, id: string) {
  return toAnnouncement(await loadAnnouncement(db, id));
}

export async function createAnnouncement(db: AppDatabase, actor: Actor, input: AnnouncementWrite) {
  assertCanWrite(actor);
  const groupIds = uniqueIds(input.groupIds);
  const recipientEmails = uniqueEmails(input.recipientEmails);
  const { ccEmails, bccEmails } = copyLists(input, recipientEmails);
  await assertGroups(db, groupIds);
  const id = crypto.randomUUID();
  const saved = savedSchedule(input);
  await db.transaction(async (tx) => {
    await tx.insert(announcements).values({
      id,
      title: input.title,
      ...prepareBody(input.bodyHtml),
      timezone: APP_TIMEZONE,
      startAt: startTimestamp(input.startDate, input.startTime),
      frequency: input.frequency,
      untilDate: saved.untilDate,
      rrule: buildRrule(saved),
      recipientEmails,
      ccEmails,
      bccEmails,
      isActive: input.isActive,
      nextRunAt: nextRunAt(saved),
      version: 1,
      createdBy: actor.id,
      updatedBy: actor.id,
    });
    if (groupIds.length > 0) {
      await tx
        .insert(announcementGroups)
        .values(groupIds.map((groupId) => ({ announcementId: id, groupId })));
    }
    await tx.insert(auditLog).values({
      actorId: actor.id,
      action: 'create',
      announcementId: id,
      detail: { groupIds, recipientEmails, ccEmails, bccEmails },
    });
  });
  return getAnnouncement(db, id);
}

export async function updateAnnouncement(
  db: AppDatabase,
  actor: Actor,
  id: string,
  input: AnnouncementUpdate,
) {
  const existing = await loadAnnouncement(db, id);
  assertCanEdit(actor, existing.createdBy);
  const groupIds = uniqueIds(input.groupIds);
  const recipientEmails = uniqueEmails(input.recipientEmails);
  const { ccEmails, bccEmails } = copyLists(input, recipientEmails);
  await assertGroups(db, groupIds);
  const saved = savedSchedule(input);
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(announcements)
      .set({
        title: input.title,
        ...prepareBody(input.bodyHtml),
        startAt: startTimestamp(input.startDate, input.startTime),
        frequency: input.frequency,
        untilDate: saved.untilDate,
        rrule: buildRrule(saved),
        recipientEmails,
        ccEmails,
        bccEmails,
        isActive: input.isActive,
        nextRunAt: nextRunAt(saved),
        version: sql`${announcements.version} + 1`,
        updatedBy: actor.id,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(announcements.id, id),
          eq(announcements.version, input.version),
          isNull(announcements.deletedAt),
        ),
      )
      .returning({ id: announcements.id });
    if (!updated[0]) {
      const still = await tx
        .select({ deletedAt: announcements.deletedAt })
        .from(announcements)
        .where(eq(announcements.id, id))
        .limit(1);
      if (!still[0] || still[0].deletedAt) throw new HttpError(404, 'Không tìm thấy thông báo');
      throw new HttpError(409, 'Thông báo đã được sửa bởi người khác. Tải lại trước khi lưu.');
    }
    await tx.delete(announcementGroups).where(eq(announcementGroups.announcementId, id));
    if (groupIds.length > 0) {
      await tx
        .insert(announcementGroups)
        .values(groupIds.map((groupId) => ({ announcementId: id, groupId })));
    }
    await tx.insert(auditLog).values({
      actorId: actor.id,
      action: 'edit',
      announcementId: id,
      detail: { groupIds, recipientEmails, ccEmails, bccEmails },
    });
  });
  return getAnnouncement(db, id);
}

export async function deleteAnnouncement(db: AppDatabase, actor: Actor, id: string) {
  const existing = await loadAnnouncement(db, id);
  assertCanEdit(actor, existing.createdBy);
  const removed = await db
    .update(announcements)
    .set({
      deletedAt: new Date(),
      isActive: false,
      updatedBy: actor.id,
      updatedAt: new Date(),
      version: sql`${announcements.version} + 1`,
    })
    .where(and(eq(announcements.id, id), isNull(announcements.deletedAt)))
    .returning({ id: announcements.id });
  if (!removed[0]) throw new HttpError(404, 'Không tìm thấy thông báo');
  await db.insert(auditLog).values({
    actorId: actor.id,
    action: 'delete',
    announcementId: id,
    detail: {},
  });
}

export async function setAnnouncementActive(
  db: AppDatabase,
  actor: Actor,
  id: string,
  isActive: boolean,
) {
  assertCanWrite(actor);
  const existing = await loadAnnouncement(db, id);
  const schedule = scheduleFromRow(existing);
  const updated = await db
    .update(announcements)
    .set({
      isActive,
      nextRunAt: isActive ? nextRunAt(schedule) : existing.nextRunAt,
      version: sql`${announcements.version} + 1`,
      updatedBy: actor.id,
      updatedAt: new Date(),
    })
    .where(and(eq(announcements.id, id), isNull(announcements.deletedAt)))
    .returning({
      id: announcements.id,
      isActive: announcements.isActive,
      nextRunAt: announcements.nextRunAt,
      version: announcements.version,
    });
  const row = updated[0];
  if (!row) throw new HttpError(404, 'Không tìm thấy thông báo');
  await db.insert(auditLog).values({
    actorId: actor.id,
    action: 'toggle',
    announcementId: id,
    detail: { isActive },
  });
  return {
    id: row.id,
    isActive: row.isActive,
    nextRunAt: row.nextRunAt?.toISOString() ?? null,
    version: row.version,
  };
}

export async function listDeliveries(db: AppDatabase, query: DeliveryListQuery) {
  const filters = [];
  if (query.status) filters.push(eq(deliveries.status, query.status));
  if (query.from) filters.push(gte(deliveries.scheduledFor, localToUtc(query.from, '00:00')));
  if (query.to) filters.push(lt(deliveries.scheduledFor, localToUtc(nextDay(query.to), '00:00')));
  const rows = await db.query.deliveries.findMany({
    where: filters.length > 0 ? and(...filters) : undefined,
    with: { announcement: { with: announcementWithGroups } },
    orderBy: [desc(deliveries.scheduledFor)],
  });
  const retriedIds = await activeRetries(
    db,
    rows.filter((row) => row.status === 'failed').map((row) => row.id),
  );
  return rows.map((row) => ({
    id: row.id,
    announcementId: row.announcementId,
    announcementCreatedBy: row.announcement?.createdBy ?? null,
    announcementDeleted: Boolean(row.announcement?.deletedAt),
    retryOf: row.retryOf,
    retried: retriedIds.has(row.id),
    title: row.announcement?.title ?? '',
    groups: (row.announcement?.groups ?? []).flatMap((link) =>
      link.group ? [{ id: link.group.id, name: link.group.name }] : [],
    ),
    recipientEmails: row.announcement?.recipientEmails ?? [],
    scheduledFor: row.scheduledFor.toISOString(),
    status: row.status,
    attempts: row.attempts,
    lastError: row.lastError,
    errorDetail: row.errorDetail ?? null,
    recipientCount: row.recipientCount,
    sentAt: row.sentAt?.toISOString() ?? null,
  }));
}

/** Failed deliveries that already have a resend waiting, sending or sent. */
async function activeRetries(db: AppDatabase, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ retryOf: deliveries.retryOf })
    .from(deliveries)
    .where(
      and(
        inArray(deliveries.retryOf, ids),
        inArray(deliveries.status, ['queued', 'sending', 'sent']),
      ),
    );
  return new Set(rows.flatMap((row) => (row.retryOf ? [row.retryOf] : [])));
}

/**
 * Queues a fresh send of a failed delivery, stamped with the current time.
 * The original row is locked so two clicks cannot queue two resends.
 */
export async function retryDelivery(db: AppDatabase, actor: Actor, id: string) {
  assertCanWrite(actor);
  return db.transaction(async (tx) => {
    const original = await tx
      .select()
      .from(deliveries)
      .where(eq(deliveries.id, id))
      .for('update')
      .limit(1);
    const failed = original[0];
    if (!failed) throw new HttpError(404, 'Không tìm thấy lần gửi');
    if (failed.status !== 'failed') {
      throw new HttpError(409, 'Chỉ gửi lại được lần gửi bị lỗi');
    }
    const announcement = await tx
      .select({ createdBy: announcements.createdBy, deletedAt: announcements.deletedAt })
      .from(announcements)
      .where(eq(announcements.id, failed.announcementId))
      .limit(1);
    if (!announcement[0] || announcement[0].deletedAt) {
      throw new HttpError(409, 'Thông báo đã bị xoá, không gửi lại được');
    }
    assertCanEdit(actor, announcement[0].createdBy);
    const existing = await tx
      .select({ id: deliveries.id })
      .from(deliveries)
      .where(
        and(eq(deliveries.retryOf, id), inArray(deliveries.status, ['queued', 'sending', 'sent'])),
      )
      .limit(1);
    if (existing[0]) throw new HttpError(409, 'Lần gửi này đã được gửi lại');

    const retryId = crypto.randomUUID();
    const scheduledFor = new Date();
    await tx.insert(deliveries).values({
      id: retryId,
      announcementId: failed.announcementId,
      scheduledFor,
      status: 'queued',
      attempts: 0,
      recipientCount: 0,
      retryOf: id,
    });
    await tx.insert(auditLog).values({
      actorId: actor.id,
      action: 'retry',
      announcementId: failed.announcementId,
      detail: { deliveryId: id, retryId },
    });
    await tx.execute(sql`select pg_notify(${RETRY_CHANNEL}, ${retryId})`);
    return { id: retryId, scheduledFor: scheduledFor.toISOString(), status: 'queued' as const };
  });
}

export async function listGroups(db: AppDatabase) {
  const rows = await db.select().from(recipientGroups).orderBy(recipientGroups.name);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    emailAddress: row.emailAddress,
    memberCount: row.memberCount,
    isActive: row.isActive,
  }));
}

export async function stats(db: AppDatabase) {
  const rows = await db
    .select({
      id: announcements.id,
      title: announcements.title,
      isActive: announcements.isActive,
      nextRunAt: announcements.nextRunAt,
    })
    .from(announcements)
    .where(isNull(announcements.deletedAt));
  let running = 0;
  let paused = 0;
  let next: { id: string; title: string; nextRunAt: Date } | null = null;
  for (const row of rows) {
    if (row.isActive) {
      running += 1;
      if (row.nextRunAt && (!next || row.nextRunAt < next.nextRunAt)) {
        next = { id: row.id, title: row.title, nextRunAt: row.nextRunAt };
      }
    } else {
      paused += 1;
    }
  }
  const month = monthBounds(new Date());
  const sentRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(deliveries)
    .where(
      and(
        eq(deliveries.status, 'sent'),
        gte(deliveries.sentAt, month.start),
        lt(deliveries.sentAt, month.end),
      ),
    );
  return {
    running,
    paused,
    sentThisMonth: sentRows[0]?.count ?? 0,
    next: next ? { id: next.id, title: next.title, nextRunAt: next.nextRunAt.toISOString() } : null,
  };
}

export async function testSend(
  db: AppDatabase,
  env: ApiEnv,
  actor: Actor,
  id: string,
  log: { warn: (object: object, message: string) => void },
) {
  assertCanWrite(actor);
  const existing = await loadAnnouncement(db, id);
  let messageId: string;
  try {
    messageId = await sendToUser(env, {
      to: actor.email,
      subject: existing.title,
      html: existing.bodyHtml,
      text: existing.bodyText,
    });
  } catch (error) {
    if (error instanceof HttpError) {
      const smtp = error.detail as { code?: string; responseCode?: number } | undefined;
      log.warn(
        { announcementId: id, smtp: { code: smtp?.code, responseCode: smtp?.responseCode } },
        'test send failed',
      );
    }
    throw error;
  }
  await db.insert(auditLog).values({
    actorId: actor.id,
    action: 'test_send',
    announcementId: id,
    detail: { to: actor.email },
  });
  return { ok: true as const, messageId, to: actor.email };
}

async function loadAnnouncement(db: AppDatabase, id: string) {
  const row = await db.query.announcements.findFirst({
    where: and(eq(announcements.id, id), isNull(announcements.deletedAt)),
    with: announcementWithGroups,
  });
  if (!row) throw new HttpError(404, 'Không tìm thấy thông báo');
  return row;
}

async function assertGroups(db: AppDatabase, ids: string[]) {
  const rows = await db
    .select({ id: recipientGroups.id })
    .from(recipientGroups)
    .where(and(eq(recipientGroups.isActive, true)));
  const active = new Set(rows.filter((row) => ids.includes(row.id)).map((row) => row.id));
  if (active.size !== ids.length) {
    throw new HttpError(400, 'Nhóm nhận không hợp lệ', { groupIds: 'Nhóm nhận không hợp lệ' });
  }
}

function savedSchedule(input: AnnouncementWrite) {
  return {
    startDate: input.startDate,
    time: input.startTime,
    frequency: input.frequency,
    untilDate: input.frequency === 'none' ? null : (input.untilDate ?? null),
  };
}

function scheduleFromRow(row: { startAt: string; frequency: string; untilDate: string | null }) {
  const start = splitStart(row.startAt);
  return {
    startDate: start.startDate,
    time: start.startTime,
    frequency: row.frequency as Frequency,
    untilDate: row.untilDate,
  };
}

function toAnnouncement(row: {
  id: string;
  title: string;
  bodyHtml: string;
  bodyText: string;
  timezone: string;
  startAt: string;
  frequency: string;
  untilDate: string | null;
  rrule: string | null;
  recipientEmails: string[];
  ccEmails: string[];
  bccEmails: string[];
  isActive: boolean;
  nextRunAt: Date | null;
  version: number;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
  groups: {
    group: { id: string; name: string; emailAddress: string; memberCount: number } | null;
  }[];
}) {
  const start = splitStart(row.startAt);
  return {
    id: row.id,
    title: row.title,
    bodyHtml: row.bodyHtml,
    bodyText: row.bodyText,
    timezone: row.timezone,
    startDate: start.startDate,
    startTime: start.startTime,
    frequency: row.frequency,
    untilDate: row.untilDate,
    rrule: row.rrule,
    recipientEmails: row.recipientEmails,
    ccEmails: row.ccEmails,
    bccEmails: row.bccEmails,
    isActive: row.isActive,
    nextRunAt: row.nextRunAt?.toISOString() ?? null,
    version: row.version,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    groups: row.groups
      .flatMap((link) =>
        link.group
          ? [
              {
                id: link.group.id,
                name: link.group.name,
                emailAddress: link.group.emailAddress,
                memberCount: link.group.memberCount,
              },
            ]
          : [],
      )
      .sort((left, right) => left.name.localeCompare(right.name, 'vi')),
  };
}

function splitStart(startAt: string): { startDate: string; startTime: string } {
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(startAt);
  if (!match?.[1] || !match[2]) throw new HttpError(500, 'Lịch gửi bị hỏng');
  return { startDate: match[1], startTime: match[2] };
}

function startTimestamp(date: string, time: string): string {
  return `${date} ${time}:00`;
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

function uniqueEmails(emails: string[]): string[] {
  return [...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))];
}

/** An address receives the mail once: To wins over CC, and CC wins over BCC. */
function copyLists(input: { ccEmails: string[]; bccEmails: string[] }, to: string[]) {
  const taken = new Set(to);
  const ccEmails = uniqueEmails(input.ccEmails).filter((email) => !taken.has(email));
  for (const email of ccEmails) taken.add(email);
  const bccEmails = uniqueEmails(input.bccEmails).filter((email) => !taken.has(email));
  return { ccEmails, bccEmails };
}

function nextDay(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  const utc = new Date(Date.UTC(year!, month! - 1, day! + 1));
  return utc.toISOString().slice(0, 10);
}

function monthBounds(now: Date): { start: Date; end: Date } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end =
    month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  return { start: localToUtc(start, '00:00'), end: localToUtc(end, '00:00') };
}
