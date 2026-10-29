import { z } from 'zod';

const flag = z
  .string()
  .optional()
  .transform((value) => value === 'true');

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  WEB_ORIGIN: z.string().url(),
  APP_TIMEZONE: z.string().min(1).default('Asia/Ho_Chi_Minh'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  SEED_ON_BOOT: flag,
  AUTH_MODE: z.enum(['dev', 'entra']).default('dev'),
  DEV_USER_EMAIL: z.string().email().default('son_le_quoc_hung@wvi.org'),
  MAIL_TRANSPORT: z.enum(['graph', 'smtp']).default('smtp'),
  MAIL_FROM_ADDRESS: z.string().email().default('phat-tin@worldvision.org.vn'),
  MAIL_FROM_NAME: z.string().min(1).default('Event Notify'),
  MAIL_USE_BCC: flag,
  SMTP_HOST: z.string().min(1).default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_SECURE: flag,
  SMTP_REQUIRE_TLS: flag,
  SMTP_USER: z
    .string()
    .optional()
    .transform((value) => value || undefined),
  SMTP_PASS: z.string().optional(),
});

export type ApiEnv = z.infer<typeof schema>;

export function readApiEnv(source: NodeJS.ProcessEnv = process.env): ApiEnv {
  return schema.parse(source);
}
