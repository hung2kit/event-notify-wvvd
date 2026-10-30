import { z } from 'zod';

const flag = z
  .string()
  .optional()
  .transform((value) => value === 'true');

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  SCHEDULER_INTERVAL_SECONDS: z.coerce.number().int().positive().default(30),
  MISSED_SEND_GRACE_MINUTES: z.coerce.number().int().nonnegative().default(60),
  MAIL_TRANSPORT: z.enum(['graph', 'smtp']).default('smtp'),
  MAIL_FROM_ADDRESS: z.string().email().default('event-notify@worldvision.org.vn'),
  MAIL_FROM_NAME: z.string().min(1).default('Event Notify'),
  MAIL_USE_BCC: flag,
  SMTP_HOST: z.string().min(1).default('127.0.0.1'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_SECURE: flag,
  SMTP_REQUIRE_TLS: flag,
  SMTP_USER: z
    .string()
    .optional()
    .transform((value) => value || undefined),
  SMTP_PASS: z.string().optional(),
});

export type WorkerEnv = z.infer<typeof schema>;

export function readWorkerEnv(source: NodeJS.ProcessEnv = process.env): WorkerEnv {
  const env = schema.parse(source);
  if (env.SCHEDULER_INTERVAL_SECONDS > 60 || 60 % env.SCHEDULER_INTERVAL_SECONDS !== 0) {
    throw new Error('SCHEDULER_INTERVAL_SECONDS must be a divisor of 60');
  }
  return env;
}

/** Six-field cron (seconds first) so the tick can run more often than once a minute. */
export function schedulerCron(intervalSeconds: number): string {
  if (intervalSeconds === 60) return '0 * * * * *';
  return `*/${intervalSeconds} * * * * *`;
}
