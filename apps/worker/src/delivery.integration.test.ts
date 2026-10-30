import { randomUUID } from 'node:crypto';
import {
  announcementGroups,
  announcements,
  createDatabase,
  deliveries,
  loadRootEnv,
  recipientGroups,
  users,
} from '@event-notify/db';
import { prepareTestDatabase, resetTestData } from '@event-notify/db/test-db';
import { eq } from 'drizzle-orm';
import PgBoss from 'pg-boss';
import pino from 'pino';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { claimDueAnnouncements, claimRetries } from './claim.js';
import { SEND_QUEUE, type SendJobData } from './queues.js';
import { processSendJob } from './send-job.js';
import { classifyTransportError, MailError, type MailTransport } from './transport.js';

loadRootEnv();

const baseUrl = process.env.DATABASE_URL;
if (!baseUrl) throw new Error('DATABASE_URL is required');

const logger = pino({ level: 'silent' });
const userId = '018f6b10-7c3a-7a21-8000-000000000001';
const groupId = '018f6b10-7c3a-7a21-8000-000000000103';

let databaseUrl = '';
let database: ReturnType<typeof createDatabase>;
const bosses: PgBoss[] = [];

beforeAll(async () => {
  databaseUrl = await prepareTestDatabase(baseUrl);
  database = createDatabase(databaseUrl);
});

beforeEach(async () => {
  await resetTestData(database.pool);
  await database.db.insert(users).values({
    id: userId,
    email: 'hanh.nguyen@worldvision.org.vn',
    displayName: 'Hạnh',
    role: 'admin',
  });
  await database.db.insert(recipientGroups).values({
    id: groupId,
    name: 'Các vùng chương trình (ADP)',
    description: 'Nhân viên tại các văn phòng vùng chương trình.',
    emailAddress: 'wv-vn-adp@worldvision.org.vn',
    memberCount: 198,
    isActive: true,
  });
});

afterEach(async () => {
  await Promise.all(bosses.splice(0).map((boss) => boss.stop({ graceful: false, timeout: 5_000 })));
});

afterAll(async () => {
  await database.pool.end();
});

describe('delivery', () => {
  it('sends a due announcement once when two workers claim it', async () => {
    const announcementId = randomUUID();
    const subject = `Event Notify kiểm tra ${announcementId}`;
    const when = new Date(Date.now() - 60_000);
    await insertAnnouncement({
      id: announcementId,
      title: subject,
      when,
      frequency: 'none',
    });

    const bossA = await startBoss();
    const bossB = await startBoss();
    await bossA.createQueue(SEND_QUEUE);

    await Promise.all([
      claimDueAnnouncements({
        pool: database.pool,
        boss: bossA,
        graceMinutes: 60,
        logger,
      }),
      claimDueAnnouncements({
        pool: database.pool,
        boss: bossB,
        graceMinutes: 60,
        logger,
      }),
    ]);

    const seen: string[] = [];
    const handler = async (jobs: PgBoss.JobWithMetadata<SendJobData>[]) => {
      const job = jobs[0];
      if (!job) return;
      seen.push(job.id);
      await processSendJob({
        db: database.db,
        pool: database.pool,
        transport: smtpTransport(),
        useBcc: false,
        fromAddress: 'event-notify@worldvision.org.vn',
        logger,
        job: {
          id: job.id,
          retryCount: job.retryCount,
          retryLimit: job.retryLimit,
          data: job.data,
        },
      });
    };
    await bossA.work<SendJobData>(
      SEND_QUEUE,
      { includeMetadata: true, batchSize: 1, pollingIntervalSeconds: 0.5 },
      handler,
    );
    await bossB.work<SendJobData>(
      SEND_QUEUE,
      { includeMetadata: true, batchSize: 1, pollingIntervalSeconds: 0.5 },
      handler,
    );

    const delivery = await waitForStatus(announcementId, 'sent');
    expect(delivery.providerMessageId).toBeTruthy();
    expect(delivery.recipientCount).toBe(198);

    const messages = await mailpitMessages(subject);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.To.map((item) => item.Address)).toEqual(['wv-vn-adp@worldvision.org.vn']);
    expect(new Set(seen).size).toBe(1);
    await deleteMailpit(messages[0]?.ID);
  });

  it('skips a send when the announcement is paused after it was queued', async () => {
    const announcementId = randomUUID();
    const when = new Date(Date.now() - 60_000);
    await insertAnnouncement({ id: announcementId, title: 'Tạm dừng', when, frequency: 'none' });
    const boss = await startBoss();
    await boss.createQueue(SEND_QUEUE);
    await claimDueAnnouncements({ pool: database.pool, boss, graceMinutes: 60, logger });
    await database.db
      .update(announcements)
      .set({ isActive: false })
      .where(eq(announcements.id, announcementId));

    const jobs = await boss.fetch<SendJobData>(SEND_QUEUE, { includeMetadata: true });
    const job = jobs[0];
    expect(job).toBeTruthy();
    await processSendJob({
      db: database.db,
      pool: database.pool,
      transport: failingTransport(),
      useBcc: false,
      fromAddress: 'event-notify@worldvision.org.vn',
      logger,
      job: {
        id: job!.id,
        retryCount: job!.retryCount,
        retryLimit: job!.retryLimit,
        data: job!.data,
      },
    });
    await boss.complete(SEND_QUEUE, job!.id);

    const rows = await database.db
      .select()
      .from(deliveries)
      .where(eq(deliveries.announcementId, announcementId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('skipped');
    expect(rows[0]?.lastError).toBe('paused or deleted');
  });

  it('retries a transient SMTP failure and then sends', async () => {
    const announcementId = randomUUID();
    const when = new Date(Date.now() - 60_000);
    await insertAnnouncement({ id: announcementId, title: 'Thử lại', when, frequency: 'none' });
    const boss = await startBoss();
    await boss.createQueue(SEND_QUEUE);
    let calls = 0;
    const transport: MailTransport = {
      async send() {
        calls += 1;
        if (calls === 1) throw new MailError('Máy chủ mail tạm từ chối', { permanent: false });
        return { messageId: 'retry-ok' };
      },
      async close() {},
    };
    await claimDueAnnouncements({
      pool: database.pool,
      boss,
      graceMinutes: 60,
      retryLimit: 4,
      retryDelaySeconds: 1,
      retryBackoff: false,
      logger,
    });
    await boss.work<SendJobData>(
      SEND_QUEUE,
      { includeMetadata: true, batchSize: 1, pollingIntervalSeconds: 0.5 },
      async (jobs) => {
        const job = jobs[0];
        if (!job) return;
        await processSendJob({
          db: database.db,
          pool: database.pool,
          transport,
          useBcc: false,
          fromAddress: 'event-notify@worldvision.org.vn',
          logger,
          job: {
            id: job.id,
            retryCount: job.retryCount,
            retryLimit: job.retryLimit,
            data: job.data,
          },
        });
      },
    );

    const delivery = await waitForStatus(announcementId, 'sent');
    expect(delivery.providerMessageId).toBe('retry-ok');
    expect(delivery.attempts).toBe(2);
    expect(calls).toBe(2);
  });

  it('sends to the selected group and typed addresses without duplicates', async () => {
    const announcementId = randomUUID();
    const when = new Date(Date.now() - 60_000);
    await insertAnnouncement({
      id: announcementId,
      title: 'Nhập tay',
      when,
      frequency: 'none',
      recipientEmails: ['lan@wvi.org', 'wv-vn-adp@worldvision.org.vn'],
    });
    const boss = await startBoss();
    await boss.createQueue(SEND_QUEUE);
    await claimDueAnnouncements({ pool: database.pool, boss, graceMinutes: 60, logger });
    const jobs = await boss.fetch<SendJobData>(SEND_QUEUE, { includeMetadata: true });
    const sent: string[][] = [];
    await processSendJob({
      db: database.db,
      pool: database.pool,
      transport: {
        async send(message) {
          sent.push([...(message.to ?? [])]);
          return { messageId: 'manual-ok' };
        },
        async close() {},
      },
      useBcc: false,
      fromAddress: 'event-notify@worldvision.org.vn',
      logger,
      job: {
        id: jobs[0]!.id,
        retryCount: jobs[0]!.retryCount,
        retryLimit: jobs[0]!.retryLimit,
        data: jobs[0]!.data,
      },
    });

    expect(sent).toEqual([['wv-vn-adp@worldvision.org.vn', 'lan@wvi.org']]);
    const rows = await database.db
      .select()
      .from(deliveries)
      .where(eq(deliveries.announcementId, announcementId));
    expect(rows[0]?.status).toBe('sent');
    expect(rows[0]?.recipientCount).toBe(199);
  });

  it('sends CC and BCC once each and keeps them out of To', async () => {
    const announcementId = randomUUID();
    const when = new Date(Date.now() - 60_000);
    await insertAnnouncement({
      id: announcementId,
      title: 'CC và BCC',
      when,
      frequency: 'none',
      recipientEmails: ['lan@wvi.org'],
      ccEmails: ['minh@wvi.org', 'lan@wvi.org'],
      bccEmails: ['hanh@wvi.org', 'minh@wvi.org', 'wv-vn-adp@worldvision.org.vn'],
    });
    const boss = await startBoss();
    await boss.createQueue(SEND_QUEUE);
    await claimDueAnnouncements({ pool: database.pool, boss, graceMinutes: 60, logger });
    const jobs = await boss.fetch<SendJobData>(SEND_QUEUE, { includeMetadata: true });
    const sent: { to?: string[]; cc?: string[]; bcc?: string[] }[] = [];
    await processSendJob({
      db: database.db,
      pool: database.pool,
      transport: {
        async send(message) {
          sent.push({ to: message.to, cc: message.cc, bcc: message.bcc });
          return { messageId: 'copies-ok' };
        },
        async close() {},
      },
      useBcc: false,
      fromAddress: 'event-notify@worldvision.org.vn',
      logger,
      job: {
        id: jobs[0]!.id,
        retryCount: jobs[0]!.retryCount,
        retryLimit: jobs[0]!.retryLimit,
        data: jobs[0]!.data,
      },
    });

    expect(sent).toEqual([
      {
        to: ['wv-vn-adp@worldvision.org.vn', 'lan@wvi.org'],
        cc: ['minh@wvi.org'],
        bcc: ['hanh@wvi.org'],
      },
    ]);
    const rows = await database.db
      .select()
      .from(deliveries)
      .where(eq(deliveries.announcementId, announcementId));
    expect(rows[0]?.recipientCount).toBe(201);
  });

  it('stores the SMTP reply when the server rejects the mail', async () => {
    const announcementId = randomUUID();
    const when = new Date(Date.now() - 60_000);
    await insertAnnouncement({ id: announcementId, title: 'Bị từ chối', when, frequency: 'none' });
    const boss = await startBoss();
    await boss.createQueue(SEND_QUEUE);
    await claimDueAnnouncements({ pool: database.pool, boss, graceMinutes: 60, logger });
    const jobs = await boss.fetch<SendJobData>(SEND_QUEUE, { includeMetadata: true });
    await processSendJob({
      db: database.db,
      pool: database.pool,
      transport: {
        async send() {
          throw classifyTransportError(
            Object.assign(new Error('Message failed'), {
              code: 'EMESSAGE',
              responseCode: 554,
              response: '554 5.2.0 STOREDRV.Submission.Exception:SendAsDeniedException',
              command: 'DATA',
            }),
          );
        },
        async close() {},
      },
      useBcc: false,
      fromAddress: 'event-notify@worldvision.org.vn',
      logger,
      job: {
        id: jobs[0]!.id,
        retryCount: jobs[0]!.retryCount,
        retryLimit: jobs[0]!.retryLimit,
        data: jobs[0]!.data,
      },
    });

    const rows = await database.db
      .select()
      .from(deliveries)
      .where(eq(deliveries.announcementId, announcementId));
    expect(rows[0]?.status).toBe('failed');
    expect(rows[0]?.lastError).toBe('Máy chủ mail từ chối thư');
    expect(rows[0]?.errorDetail?.attempts).toEqual([
      expect.objectContaining({
        attempt: 1,
        permanent: true,
        summary: 'Máy chủ mail từ chối thư',
        code: 'EMESSAGE',
        responseCode: 554,
        response: '554 5.2.0 STOREDRV.Submission.Exception:SendAsDeniedException',
        command: 'DATA',
      }),
    ]);
  });

  it('queues a manual resend once and sends it even when the schedule is off', async () => {
    const announcementId = randomUUID();
    const when = new Date(Date.now() - 60 * 60_000);
    await insertAnnouncement({ id: announcementId, title: 'Gửi lại', when, frequency: 'none' });
    await database.db
      .update(announcements)
      .set({ isActive: false, nextRunAt: null })
      .where(eq(announcements.id, announcementId));
    const failedId = randomUUID();
    await database.db.insert(deliveries).values({
      id: failedId,
      announcementId,
      scheduledFor: when,
      status: 'failed',
      attempts: 1,
      lastError: 'Máy chủ mail từ chối thư',
      recipientCount: 198,
    });
    const retryId = randomUUID();
    await database.db.insert(deliveries).values({
      id: retryId,
      announcementId,
      scheduledFor: new Date(),
      status: 'queued',
      attempts: 0,
      recipientCount: 0,
      retryOf: failedId,
    });

    const boss = await startBoss();
    await boss.createQueue(SEND_QUEUE);
    expect(await claimRetries({ pool: database.pool, boss, logger })).toBe(1);
    expect(await claimRetries({ pool: database.pool, boss, logger })).toBe(0);
    const jobs = await boss.fetch<SendJobData>(SEND_QUEUE, { includeMetadata: true, batchSize: 5 });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.id).toBe(retryId);

    let sends = 0;
    await processSendJob({
      db: database.db,
      pool: database.pool,
      transport: {
        async send() {
          sends += 1;
          return { messageId: 'resend-ok' };
        },
        async close() {},
      },
      useBcc: false,
      fromAddress: 'event-notify@worldvision.org.vn',
      logger,
      job: {
        id: jobs[0]!.id,
        retryCount: jobs[0]!.retryCount,
        retryLimit: jobs[0]!.retryLimit,
        data: jobs[0]!.data,
      },
    });

    expect(sends).toBe(1);
    const rows = await database.db.select().from(deliveries).where(eq(deliveries.id, retryId));
    expect(rows[0]?.status).toBe('sent');
    expect(rows[0]?.providerMessageId).toBe('resend-ok');
    expect(await claimRetries({ pool: database.pool, boss, logger })).toBe(0);
  });

  it('sends to typed addresses when no group is selected', async () => {
    const announcementId = randomUUID();
    const when = new Date(Date.now() - 60_000);
    await insertAnnouncement({
      id: announcementId,
      title: 'Chỉ nhập tay',
      when,
      frequency: 'none',
      recipientEmails: ['lan@wvi.org'],
      withGroup: false,
    });
    const boss = await startBoss();
    await boss.createQueue(SEND_QUEUE);
    await claimDueAnnouncements({ pool: database.pool, boss, graceMinutes: 60, logger });
    const jobs = await boss.fetch<SendJobData>(SEND_QUEUE, { includeMetadata: true });
    const sent: string[][] = [];
    await processSendJob({
      db: database.db,
      pool: database.pool,
      transport: {
        async send(message) {
          sent.push([...(message.to ?? [])]);
          return { messageId: 'manual-only' };
        },
        async close() {},
      },
      useBcc: false,
      fromAddress: 'event-notify@worldvision.org.vn',
      logger,
      job: {
        id: jobs[0]!.id,
        retryCount: jobs[0]!.retryCount,
        retryLimit: jobs[0]!.retryLimit,
        data: jobs[0]!.data,
      },
    });

    expect(sent).toEqual([['lan@wvi.org']]);
    const rows = await database.db
      .select()
      .from(deliveries)
      .where(eq(deliveries.announcementId, announcementId));
    expect(rows[0]?.status).toBe('sent');
    expect(rows[0]?.recipientCount).toBe(1);
  });

  it('skips occurrences missed by more than an hour and sends a recent one', async () => {
    const now = new Date('2026-10-27T07:00:00.000Z');
    const staleId = randomUUID();
    const recentId = randomUUID();
    const staleWhen = new Date('2026-10-24T04:00:00.000Z');
    const recentWhen = new Date('2026-10-27T06:50:00.000Z');
    await insertAnnouncement({
      id: staleId,
      title: 'Trễ',
      when: staleWhen,
      frequency: 'daily',
      nextRunAt: staleWhen,
    });
    await insertAnnouncement({
      id: recentId,
      title: 'Gần đây',
      when: recentWhen,
      frequency: 'none',
      nextRunAt: recentWhen,
    });

    const boss = await startBoss();
    await boss.createQueue(SEND_QUEUE);
    const result = await claimDueAnnouncements({
      pool: database.pool,
      boss,
      now,
      graceMinutes: 60,
      logger,
    });
    expect(result.skipped).toBe(4);
    expect(result.queued).toBe(1);

    const jobs = await boss.fetch<SendJobData>(SEND_QUEUE, { includeMetadata: true });
    expect(jobs).toHaveLength(1);
    await processSendJob({
      db: database.db,
      pool: database.pool,
      transport: {
        async send() {
          return { messageId: 'recent-ok' };
        },
        async close() {},
      },
      useBcc: false,
      fromAddress: 'event-notify@worldvision.org.vn',
      logger,
      job: {
        id: jobs[0]!.id,
        retryCount: jobs[0]!.retryCount,
        retryLimit: jobs[0]!.retryLimit,
        data: jobs[0]!.data,
      },
    });

    const staleRows = await database.db
      .select()
      .from(deliveries)
      .where(eq(deliveries.announcementId, staleId));
    expect(staleRows.map((row) => row.status)).toEqual([
      'skipped',
      'skipped',
      'skipped',
      'skipped',
    ]);
    expect(staleRows.every((row) => row.lastError === 'missed while offline')).toBe(true);

    const staleAnnouncement = await database.db
      .select()
      .from(announcements)
      .where(eq(announcements.id, staleId));
    expect(staleAnnouncement[0]?.isActive).toBe(true);
    expect(staleAnnouncement[0]?.nextRunAt?.toISOString()).toBe('2026-10-28T04:00:00.000Z');

    const recentRows = await database.db
      .select()
      .from(deliveries)
      .where(eq(deliveries.announcementId, recentId));
    expect(recentRows[0]?.status).toBe('sent');
    expect(recentRows[0]?.providerMessageId).toBe('recent-ok');
  });
});

async function startBoss(): Promise<PgBoss> {
  const boss = new PgBoss({ connectionString: databaseUrl });
  bosses.push(boss);
  await boss.start();
  return boss;
}

function smtpTransport(): MailTransport {
  return {
    async send(message) {
      const nodemailer = await import('nodemailer');
      const transport = nodemailer.default.createTransport({
        host: '127.0.0.1',
        port: 1025,
        secure: false,
      });
      try {
        const info = await transport.sendMail({
          from: 'event-notify@worldvision.org.vn',
          to: message.to,
          bcc: message.bcc,
          subject: message.subject,
          html: message.html,
          text: message.text,
        });
        return { messageId: info.messageId };
      } finally {
        transport.close();
      }
    },
    async close() {},
  };
}

function failingTransport(): MailTransport {
  return {
    async send() {
      throw new Error('should not send');
    },
    async close() {},
  };
}

async function insertAnnouncement(input: {
  id: string;
  title: string;
  when: Date;
  frequency: 'none' | 'daily';
  nextRunAt?: Date;
  recipientEmails?: string[];
  ccEmails?: string[];
  bccEmails?: string[];
  withGroup?: boolean;
}): Promise<void> {
  const wall = wallClock(input.when);
  await database.db.insert(announcements).values({
    id: input.id,
    title: input.title,
    bodyHtml: '<p>Nội dung kiểm tra</p>',
    bodyText: 'Nội dung kiểm tra',
    timezone: 'Asia/Ho_Chi_Minh',
    startAt: `${wall.date} ${wall.time}:00`,
    frequency: input.frequency,
    untilDate: null,
    rrule: null,
    isActive: true,
    nextRunAt: input.nextRunAt ?? input.when,
    version: 1,
    createdBy: userId,
    updatedBy: userId,
    recipientEmails: input.recipientEmails ?? [],
    ccEmails: input.ccEmails ?? [],
    bccEmails: input.bccEmails ?? [],
  });
  if (input.withGroup === false) return;
  await database.db.insert(announcementGroups).values({
    announcementId: input.id,
    groupId,
  });
}

function wallClock(instant: Date): { date: string; time: string } {
  const shifted = new Date(instant.getTime() + 7 * 60 * 60 * 1000);
  const iso = shifted.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

async function waitForStatus(announcementId: string, status: string) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const rows = await database.db
      .select()
      .from(deliveries)
      .where(eq(deliveries.announcementId, announcementId));
    const match = rows.find((row) => row.status === status);
    if (match) return match;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`delivery did not reach ${status}`);
}

type MailpitMessage = { ID: string; To: { Address: string }[] };

async function mailpitMessages(subject: string): Promise<MailpitMessage[]> {
  const response = await fetch('http://127.0.0.1:8025/api/v1/messages');
  if (!response.ok) throw new Error(`mailpit ${response.status}`);
  const body = (await response.json()) as {
    messages?: { ID: string; Subject: string; To: { Address: string }[] }[];
  };
  return (body.messages ?? []).filter((message) => message.Subject === subject);
}

async function deleteMailpit(id: string | undefined): Promise<void> {
  if (!id) return;
  await fetch('http://127.0.0.1:8025/api/v1/messages', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids: [id] }),
  });
}
