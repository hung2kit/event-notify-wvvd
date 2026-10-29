export const TICK_QUEUE = 'scheduler-tick';
export const SEND_QUEUE = 'send-announcement';

/** First try plus four retries: about 1, 2, 4 and 8 minutes apart. */
export const SEND_RETRY_LIMIT = 4;
export const SEND_RETRY_DELAY_SECONDS = 60;

export const MISSED_OFFLINE_REASON = 'missed while offline';
export const PAUSED_REASON = 'paused or deleted';

export type SendJobData = {
  announcementId: string;
  scheduledFor: string;
};
