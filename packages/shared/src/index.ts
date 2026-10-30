/** Vietnam has no daylight-saving time. Every schedule is evaluated in this zone. */
export const APP_TIMEZONE = 'Asia/Ho_Chi_Minh';

/** Postgres NOTIFY channel the API uses to wake the worker after a manual resend. */
export const RETRY_CHANNEL = 'event_notify_retry';

/** GET /health/worker is stale when the last scheduler tick is older than this. */
export const WORKER_TICK_STALE_MS = 2 * 60 * 1000;

export type CheckStatus = 'ok' | 'error';

export type HealthReport = {
  status: 'ok' | 'error';
  checks: {
    database: CheckStatus;
    queue: CheckStatus;
  };
};

export type WorkerHealthReport = {
  status: 'ok' | 'stale';
  lastTickAt: string | null;
  lagSeconds: number | null;
};

export {
  FREQUENCIES,
  buildRrule,
  isValidDate,
  isValidTime,
  localToUtc,
  nextRunAt,
  upcomingOccurrences,
} from './recurrence.js';
export type { Frequency, Occurrence, ScheduleInput } from './recurrence.js';
export {
  announcementListQuerySchema,
  announcementUpdateSchema,
  announcementWriteSchema,
  deliveryListQuerySchema,
  frequencySchema,
  previewQuerySchema,
  toggleActiveSchema,
} from './schemas.js';
export type {
  AnnouncementListQuery,
  AnnouncementUpdate,
  AnnouncementWrite,
  DeliveryListQuery,
  PreviewQuery,
  ToggleActive,
} from './schemas.js';
export { appendAttemptError, describeMailError, MAX_ATTEMPT_ERRORS } from './mail-error.js';
export type { DeliveryAttemptError, DeliveryErrorDetail, MailErrorDetail } from './mail-error.js';
export { extractInlineImages } from './inline-images.js';
export type { InlineImageAttachment } from './inline-images.js';
