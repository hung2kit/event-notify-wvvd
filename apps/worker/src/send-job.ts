import {
  announcements,
  announcementGroups,
  deliveries,
  recipientGroups,
  type AppDatabase,
} from '@event-notify/db';
import {
  appendAttemptError,
  describeMailError,
  type DeliveryErrorDetail,
} from '@event-notify/shared';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type pg from 'pg';
import type { WorkerLog } from './log.js';
import { PAUSED_REASON, type SendJobData } from './queues.js';
import { MailError, type MailTransport } from './transport.js';

export async function processSendJob(input: {
  db: AppDatabase;
  pool: pg.Pool;
  transport: MailTransport;
  useBcc: boolean;
  fromAddress: string;
  logger: WorkerLog;
  job: {
    id: string;
    retryCount: number;
    retryLimit: number;
    data: SendJobData;
  };
}): Promise<void> {
  const { announcementId, scheduledFor: scheduledForIso } = input.job.data;
  const scheduledFor = new Date(scheduledForIso);
  const logBase = { announcementId, scheduledFor: scheduledForIso };

  const delivery = await findDelivery(input.db, announcementId, scheduledFor);
  if (!delivery) {
    input.logger.warn(logBase, 'delivery missing');
    return;
  }
  if (delivery.status === 'sent' || delivery.status === 'failed' || delivery.status === 'skipped') {
    return;
  }

  const announcement = await input.db
    .select()
    .from(announcements)
    .where(eq(announcements.id, announcementId))
    .limit(1);
  const row = announcement[0];
  const manualResend = Boolean(delivery.retryOf);
  if (!row || row.deletedAt || (!row.isActive && !manualResend)) {
    await mark(input, delivery.id, {
      status: 'skipped',
      lastError: PAUSED_REASON,
    });
    input.logger.info({ ...logBase, status: 'skipped' }, 'delivery skipped');
    return;
  }

  const claimed = await input.db
    .update(deliveries)
    .set({
      status: 'sending',
      attempts: sql`${deliveries.attempts} + 1`,
      lastError: null,
    })
    .where(and(eq(deliveries.id, delivery.id), eq(deliveries.status, 'queued')))
    .returning({ attempts: deliveries.attempts });

  let attempts = claimed[0]?.attempts;
  if (!claimed[0]) {
    if (delivery.status === 'sending' && input.job.retryCount > 0) {
      const resumed = await input.db
        .update(deliveries)
        .set({ attempts: sql`${deliveries.attempts} + 1` })
        .where(eq(deliveries.id, delivery.id))
        .returning({ attempts: deliveries.attempts });
      attempts = resumed[0]?.attempts ?? delivery.attempts + 1;
    } else {
      return;
    }
  }

  input.logger.info({ ...logBase, status: 'sending', attempt: attempts }, 'delivery sending');

  const groups = await input.db
    .select({
      emailAddress: recipientGroups.emailAddress,
      memberCount: recipientGroups.memberCount,
    })
    .from(announcementGroups)
    .innerJoin(recipientGroups, eq(announcementGroups.groupId, recipientGroups.id))
    .where(
      and(
        eq(announcementGroups.announcementId, announcementId),
        eq(recipientGroups.isActive, true),
      ),
    );

  const groupAddresses = new Set(
    groups.map((group) => group.emailAddress.trim().toLowerCase()).filter(Boolean),
  );
  const manualAddresses = [
    ...new Set(row.recipientEmails.map((email) => email.trim().toLowerCase()).filter(Boolean)),
  ].filter((email) => !groupAddresses.has(email));
  const addresses = [...groupAddresses, ...manualAddresses];
  const taken = new Set(addresses);
  const ccAddresses = uniqueNew(row.ccEmails, taken);
  const bccAddresses = uniqueNew(row.bccEmails, taken);
  const memberTotal = groups.reduce((sum, group) => sum + group.memberCount, 0);
  const recipientCount =
    (memberTotal + manualAddresses.length || addresses.length) +
    ccAddresses.length +
    bccAddresses.length;
  if (addresses.length === 0) {
    await mark(input, delivery.id, {
      status: 'failed',
      lastError: 'Không có người nhận',
      recipientCount: 0,
    });
    input.logger.warn({ ...logBase, status: 'failed' }, 'delivery failed');
    await finishSeries(input.db, announcementId);
    return;
  }

  try {
    const sent = await input.transport.send({
      to: input.useBcc ? [input.fromAddress] : addresses,
      cc: ccAddresses.length > 0 ? ccAddresses : undefined,
      bcc: input.useBcc
        ? [...addresses, ...bccAddresses]
        : bccAddresses.length > 0
          ? bccAddresses
          : undefined,
      subject: row.title,
      html: row.bodyHtml,
      text: row.bodyText,
    });
    await mark(input, delivery.id, {
      status: 'sent',
      providerMessageId: sent.messageId,
      recipientCount,
      sentAt: new Date(),
      lastError: null,
    });
    input.logger.info({ ...logBase, status: 'sent' }, 'delivery sent');
    await finishSeries(input.db, announcementId);
  } catch (error) {
    const mailError =
      error instanceof MailError
        ? error
        : new MailError('Không gửi được email', {
            permanent: false,
            detail: describeMailError(error),
          });
    const lastAttempt = input.job.retryCount >= input.job.retryLimit;
    const errorDetail = appendAttemptError(delivery.errorDetail, {
      at: new Date().toISOString(),
      attempt: attempts ?? delivery.attempts + 1,
      permanent: mailError.permanent,
      summary: mailError.message,
      ...mailError.detail,
    });
    const smtp = { code: mailError.detail?.code, responseCode: mailError.detail?.responseCode };
    if (mailError.permanent || lastAttempt) {
      await mark(input, delivery.id, {
        status: 'failed',
        lastError: mailError.message,
        errorDetail,
        recipientCount,
      });
      input.logger.warn(
        { ...logBase, status: 'failed', attempt: attempts, err: mailError.message, smtp },
        'delivery failed',
      );
      await finishSeries(input.db, announcementId);
      return;
    }

    await mark(input, delivery.id, {
      status: 'queued',
      lastError: mailError.message,
      errorDetail,
      recipientCount,
    });
    if (mailError.retryAfterSeconds && mailError.retryAfterSeconds > 0) {
      await input.pool.query(
        'update pgboss.job set retry_delay = $1, retry_backoff = false where id = $2',
        [Math.ceil(mailError.retryAfterSeconds), input.job.id],
      );
    }
    input.logger.warn(
      { ...logBase, status: 'queued', attempt: attempts, err: mailError.message, smtp },
      'delivery retry',
    );
    throw mailError;
  }
}

/** Adds each new address to `taken` so later lists skip it. */
function uniqueNew(emails: string[], taken: Set<string>): string[] {
  const result: string[] = [];
  for (const raw of emails) {
    const email = raw.trim().toLowerCase();
    if (!email || taken.has(email)) continue;
    taken.add(email);
    result.push(email);
  }
  return result;
}

/** One-time and finished series have no next run. Deactivate them after the send settles. */
async function finishSeries(db: AppDatabase, announcementId: string): Promise<void> {
  await db
    .update(announcements)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      and(
        eq(announcements.id, announcementId),
        isNull(announcements.nextRunAt),
        eq(announcements.isActive, true),
        isNull(announcements.deletedAt),
      ),
    );
}

async function findDelivery(db: AppDatabase, announcementId: string, scheduledFor: Date) {
  const rows = await db
    .select()
    .from(deliveries)
    .where(
      and(eq(deliveries.announcementId, announcementId), eq(deliveries.scheduledFor, scheduledFor)),
    )
    .limit(1);
  return rows[0];
}

async function mark(
  input: { db: AppDatabase },
  id: string,
  values: {
    status: 'queued' | 'sending' | 'sent' | 'failed' | 'skipped';
    lastError?: string | null;
    errorDetail?: DeliveryErrorDetail | null;
    recipientCount?: number;
    providerMessageId?: string | null;
    sentAt?: Date | null;
  },
): Promise<void> {
  await input.db.update(deliveries).set(values).where(eq(deliveries.id, id));
}
