import { randomUUID } from 'node:crypto';
import { announcements, deliveries } from '@phat-tin/db';
import { FREQUENCIES, nextRunAt, type Frequency, type ScheduleInput } from '@phat-tin/shared';
import { and, eq, isNull, lte } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type PgBoss from 'pg-boss';
import type pg from 'pg';
import {
  MISSED_OFFLINE_REASON,
  SEND_QUEUE,
  SEND_RETRY_DELAY_SECONDS,
  SEND_RETRY_LIMIT,
  type SendJobData,
} from './queues.js';
import type { WorkerLog } from './log.js';

const MAX_OCCURRENCES_PER_TICK = 500;

export async function claimDueAnnouncements(input: {
  pool: pg.Pool;
  boss: PgBoss;
  now?: Date;
  graceMinutes: number;
  retryLimit?: number;
  retryDelaySeconds?: number;
  retryBackoff?: boolean;
  logger: WorkerLog;
}): Promise<{ queued: number; skipped: number }> {
  const now = input.now ?? new Date();
  const graceMs = input.graceMinutes * 60 * 1000;
  const client = await input.pool.connect();
  const queuedJobs: SendJobData[] = [];
  let queued = 0;
  let skipped = 0;

  try {
    await client.query('BEGIN');
    const tx = drizzle(client, { schema: { announcements, deliveries } });
    const due = await tx
      .select()
      .from(announcements)
      .where(
        and(
          eq(announcements.isActive, true),
          isNull(announcements.deletedAt),
          lte(announcements.nextRunAt, now),
        ),
      )
      .orderBy(announcements.nextRunAt)
      .for('update', { skipLocked: true });

    for (const row of due) {
      const schedule = scheduleFromRow(row.startAt, row.frequency, row.untilDate);
      let cursor = row.nextRunAt;
      let pendingSend = false;
      let steps = 0;
      while (cursor && cursor.getTime() <= now.getTime() && steps < MAX_OCCURRENCES_PER_TICK) {
        steps += 1;
        const scheduledFor = cursor;
        const late = now.getTime() - scheduledFor.getTime() >= graceMs;
        const inserted = await tx
          .insert(deliveries)
          .values({
            id: randomUUID(),
            announcementId: row.id,
            scheduledFor,
            status: late ? 'skipped' : 'queued',
            attempts: 0,
            lastError: late ? MISSED_OFFLINE_REASON : null,
            recipientCount: 0,
          })
          .onConflictDoNothing()
          .returning({ id: deliveries.id });

        if (inserted[0]) {
          if (late) {
            skipped += 1;
            input.logger.info(
              {
                announcementId: row.id,
                scheduledFor: scheduledFor.toISOString(),
                status: 'skipped',
              },
              'delivery skipped',
            );
          } else {
            queued += 1;
            pendingSend = true;
            queuedJobs.push({
              announcementId: row.id,
              scheduledFor: scheduledFor.toISOString(),
            });
            input.logger.info(
              {
                announcementId: row.id,
                scheduledFor: scheduledFor.toISOString(),
                status: 'queued',
              },
              'delivery queued',
            );
          }
        }

        const following = nextRunAt(schedule, new Date(scheduledFor.getTime() + 1000));
        if (following && following.getTime() <= scheduledFor.getTime()) break;
        cursor = following;
      }

      await tx
        .update(announcements)
        .set({
          nextRunAt: cursor,
          // A finished series stays active until its queued send completes, so a pause can still skip it.
          isActive: cursor !== null || pendingSend,
          updatedAt: now,
        })
        .where(eq(announcements.id, row.id));
    }

    for (const job of queuedJobs) {
      await input.boss.send(SEND_QUEUE, job, {
        db: {
          async executeSql(text, values) {
            const result = await client.query(text, values);
            return { rows: result.rows };
          },
        },
        singletonKey: `${job.announcementId}:${job.scheduledFor}`,
        retryLimit: input.retryLimit ?? SEND_RETRY_LIMIT,
        retryDelay: input.retryDelaySeconds ?? SEND_RETRY_DELAY_SECONDS,
        retryBackoff: input.retryBackoff ?? true,
      });
    }

    await client.query('COMMIT');
    return { queued, skipped };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Queues manual resends created by the API. The job id is the delivery id,
 * so a second pass over the same row cannot add a second job.
 */
export async function claimRetries(input: {
  pool: pg.Pool;
  boss: PgBoss;
  retryLimit?: number;
  retryDelaySeconds?: number;
  logger: WorkerLog;
}): Promise<number> {
  const pending = await input.pool.query<{
    id: string;
    announcement_id: string;
    scheduled_for: Date;
  }>(
    `select id, announcement_id, scheduled_for from deliveries
     where retry_of is not null and status = 'queued' and attempts = 0
     order by scheduled_for
     limit 100`,
  );
  let queued = 0;
  for (const row of pending.rows) {
    const job: SendJobData = {
      announcementId: row.announcement_id,
      scheduledFor: row.scheduled_for.toISOString(),
    };
    const jobId = await input.boss.send(SEND_QUEUE, job, {
      id: row.id,
      retryLimit: input.retryLimit ?? SEND_RETRY_LIMIT,
      retryDelay: input.retryDelaySeconds ?? SEND_RETRY_DELAY_SECONDS,
      retryBackoff: true,
    });
    if (jobId) {
      queued += 1;
      input.logger.info(
        { announcementId: job.announcementId, scheduledFor: job.scheduledFor, status: 'queued' },
        'delivery retry queued',
      );
    }
  }
  return queued;
}

function scheduleFromRow(
  startAt: string,
  frequency: string,
  untilDate: string | null,
): ScheduleInput {
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(startAt);
  if (!match?.[1] || !match[2] || !isFrequency(frequency)) {
    throw new Error('Lịch gửi bị hỏng');
  }
  return {
    startDate: match[1],
    time: match[2],
    frequency,
    untilDate: frequency === 'none' ? null : untilDate,
  };
}

function isFrequency(value: string): value is Frequency {
  return (FREQUENCIES as readonly string[]).includes(value);
}
