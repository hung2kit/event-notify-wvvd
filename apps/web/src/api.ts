import { DEV_EMAIL_KEY } from './stores/session';
import type {
  Announcement,
  Delivery,
  Group,
  MailErrorDetail,
  Occurrence,
  Stats,
  User,
  WorkerHealth,
} from './types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fields?: Record<string, string>,
    readonly detail?: MailErrorDetail,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function devUserHeader(): Record<string, string> {
  const email = sessionStorage.getItem(DEV_EMAIL_KEY);
  return email ? { 'x-dev-user-email': email } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...devUserHeader(),
      ...init?.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  const body = text
    ? (JSON.parse(text) as {
        error?: string;
        fields?: Record<string, string>;
        detail?: MailErrorDetail;
      })
    : {};
  if (!response.ok) {
    throw new ApiError(response.status, body.error ?? 'Lỗi máy chủ', body.fields, body.detail);
  }
  return body as T;
}

export const api = {
  me: () => request<{ user: User | null }>('/api/me'),
  devUsers: () => request<{ users: User[] }>('/api/dev/users'),
  announcements: () =>
    request<{ announcements: Announcement[] }>('/api/announcements?status=all&sort=next'),
  stats: () => request<Stats>('/api/stats'),
  groups: () => request<{ groups: Group[] }>('/api/groups'),
  deliveries: () => request<{ deliveries: Delivery[] }>('/api/deliveries'),
  preview: (query: { start: string; time: string; frequency: string; until?: string }) => {
    const params = new URLSearchParams({
      start: query.start,
      time: query.time,
      frequency: query.frequency,
    });
    if (query.until) params.set('until', query.until);
    return request<{ occurrences: Occurrence[] }>(`/api/announcements/preview?${params}`);
  },
  create: (body: unknown) =>
    request<{ announcement: Announcement }>('/api/announcements', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  update: (id: string, body: unknown) =>
    request<{ announcement: Announcement }>(`/api/announcements/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  remove: (id: string) => request<void>(`/api/announcements/${id}`, { method: 'DELETE' }),
  setActive: (id: string, isActive: boolean) =>
    request<{ id: string; isActive: boolean; nextRunAt: string | null; version: number }>(
      `/api/announcements/${id}/active`,
      { method: 'PATCH', body: JSON.stringify({ isActive }) },
    ),
  testSend: (id: string) =>
    request<{ ok: true; messageId: string; to: string }>(`/api/announcements/${id}/test-send`, {
      method: 'POST',
    }),
  retryDelivery: (id: string) =>
    request<{ delivery: { id: string; scheduledFor: string; status: 'queued' } }>(
      `/api/deliveries/${id}/retry`,
      { method: 'POST' },
    ),
  workerHealth: () => request<WorkerHealth>('/health/worker'),
};
