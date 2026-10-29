import { createDatabase, loadRootEnv, recordSchedulerTick } from '@phat-tin/db';
import { RETRY_CHANNEL } from '@phat-tin/shared';
import pg from 'pg';
import PgBoss from 'pg-boss';
import pino from 'pino';
import { claimDueAnnouncements, claimRetries } from './claim.js';
import { readWorkerEnv, schedulerCron } from './env.js';
import { SEND_QUEUE, TICK_QUEUE, type SendJobData } from './queues.js';
import { processSendJob } from './send-job.js';
import { createMailTransport, type MailTransport } from './transport.js';

loadRootEnv();

const env = readWorkerEnv();
const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: ['bodyHtml', 'bodyText', 'html', 'text', 'password', 'pass', 'SMTP_PASS'],
    remove: true,
  },
});
const database = createDatabase(env.DATABASE_URL);
const monitorSeconds = Math.min(env.SCHEDULER_INTERVAL_SECONDS, 45);
const boss = new PgBoss({
  connectionString: env.DATABASE_URL,
  cronMonitorIntervalSeconds: monitorSeconds,
  cronWorkerIntervalSeconds: monitorSeconds,
});

boss.on('error', (error) => {
  logger.error({ err: error }, 'pg-boss error');
});

async function waitForSchema(): Promise<void> {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      await database.pool.query('select 1 from scheduler_state limit 1');
      return;
    } catch (error) {
      logger.warn({ attempt, err: error }, 'waiting for database schema');
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error('database schema was not ready after 30 seconds');
}

async function ensureQueue(name: string): Promise<void> {
  const existing = await boss.getQueue(name);
  if (!existing) await boss.createQueue(name);
}

async function tick(): Promise<void> {
  const at = new Date();
  await recordSchedulerTick(database.db, at);
  await claimDueAnnouncements({
    pool: database.pool,
    boss,
    graceMinutes: env.MISSED_SEND_GRACE_MINUTES,
    logger,
  });
  await claimRetries({ pool: database.pool, boss, logger });
  if (!retryListener) void listenForRetries();
  logger.info({ lastTickAt: at.toISOString() }, 'scheduler tick');
}

let stopping = false;
let transport: MailTransport | undefined;
let retryListener: pg.Client | null = null;
let retryClaim: Promise<void> | null = null;

/** Picks up a manual resend right away. The scheduler tick covers any missed notification. */
function claimRetriesSoon(): void {
  if (stopping || retryClaim) return;
  retryClaim = claimRetries({ pool: database.pool, boss, logger })
    .then(() => undefined)
    .catch((error: unknown) => {
      logger.warn({ err: error }, 'retry claim failed');
    })
    .finally(() => {
      retryClaim = null;
    });
}

async function listenForRetries(): Promise<void> {
  if (stopping || retryListener) return;
  const client = new pg.Client({ connectionString: env.DATABASE_URL });
  retryListener = client;
  client.on('notification', () => claimRetriesSoon());
  client.on('error', (error) => {
    logger.warn({ err: error }, 'retry listener lost');
    retryListener = null;
    void client.end().catch(() => undefined);
  });
  try {
    await client.connect();
    await client.query(`LISTEN ${RETRY_CHANNEL}`);
  } catch (error) {
    logger.warn({ err: error }, 'retry listener failed to start');
    retryListener = null;
    await client.end().catch(() => undefined);
  }
}

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'shutting down');
  try {
    await boss.stop({ graceful: true, timeout: 30_000 });
  } catch (error) {
    logger.warn({ err: error }, 'pg-boss stop failed');
  }
  await retryListener?.end().catch(() => undefined);
  await transport?.close();
  await database.pool.end();
  process.exit(0);
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

try {
  await waitForSchema();
  const mail = createMailTransport(env);
  transport = mail;
  await boss.start();
  await ensureQueue(TICK_QUEUE);
  await ensureQueue(SEND_QUEUE);

  const cron = schedulerCron(env.SCHEDULER_INTERVAL_SECONDS);
  await boss.schedule(TICK_QUEUE, cron, {}, { tz: 'UTC' });
  await boss.work(TICK_QUEUE, async () => {
    if (stopping) return;
    await tick();
  });
  await boss.work<SendJobData>(
    SEND_QUEUE,
    { includeMetadata: true, batchSize: 1 },
    async (jobs) => {
      const job = jobs[0];
      if (!job || stopping) return;
      await processSendJob({
        db: database.db,
        pool: database.pool,
        transport: mail,
        useBcc: env.MAIL_USE_BCC,
        fromAddress: env.MAIL_FROM_ADDRESS,
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
  await listenForRetries();
  await tick();

  logger.info({ cron, queue: TICK_QUEUE }, 'worker started');
} catch (error) {
  logger.error({ err: error }, 'worker failed to start');
  try {
    await boss.stop({ graceful: false, timeout: 5_000 });
  } catch (stopError) {
    logger.warn({ err: stopError }, 'pg-boss stop failed');
  }
  await transport?.close();
  await database.pool.end();
  process.exit(1);
}
