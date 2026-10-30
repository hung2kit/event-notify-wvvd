import type { Frequency } from '@event-notify/shared/schema';

export type User = {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'editor' | 'viewer';
};

export type Group = {
  id: string;
  name: string;
  description: string | null;
  emailAddress: string;
  memberCount: number;
  isActive: boolean;
};

export type AnnouncementGroup = {
  id: string;
  name: string;
  emailAddress: string;
  memberCount: number;
};

export type Announcement = {
  id: string;
  title: string;
  bodyHtml: string;
  bodyText: string;
  timezone: string;
  startDate: string;
  startTime: string;
  frequency: Frequency;
  untilDate: string | null;
  isActive: boolean;
  nextRunAt: string | null;
  version: number;
  createdBy: string;
  groups: AnnouncementGroup[];
  recipientEmails: string[];
  ccEmails: string[];
  bccEmails: string[];
};

export type Stats = {
  running: number;
  paused: number;
  sentThisMonth: number;
  next: { id: string; title: string; nextRunAt: string } | null;
};

export type DeliveryStatus = 'queued' | 'sending' | 'sent' | 'failed' | 'skipped';

export type Delivery = {
  id: string;
  announcementId: string;
  announcementCreatedBy: string | null;
  announcementDeleted: boolean;
  retryOf: string | null;
  retried: boolean;
  title: string;
  groups: { id: string; name: string }[];
  recipientEmails: string[];
  scheduledFor: string;
  status: DeliveryStatus;
  attempts: number;
  lastError: string | null;
  errorDetail: { attempts: DeliveryAttemptError[] } | null;
  recipientCount: number;
  sentAt: string | null;
};

export type MailErrorDetail = {
  code?: string;
  responseCode?: number;
  response?: string;
  command?: string;
  message?: string;
  rejected?: string[];
};

export type DeliveryAttemptError = MailErrorDetail & {
  at: string;
  attempt: number;
  permanent: boolean;
  summary: string;
};

export type Occurrence = {
  at: string;
  localDate: string;
  localTime: string;
};

export type WorkerHealth = {
  status: 'ok' | 'stale';
  lastTickAt: string | null;
  lagSeconds: number | null;
};
