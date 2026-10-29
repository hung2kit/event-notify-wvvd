import {
  SEED_IDS,
  createDatabase,
  deliveries,
  loadRootEnv,
  seedDatabase,
  auditLog,
} from '@phat-tin/db';
import { prepareTestDatabase } from '@phat-tin/db/test-db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { readApiEnv } from './env.js';

loadRootEnv();

const baseUrl = process.env.DATABASE_URL;
if (!baseUrl) throw new Error('DATABASE_URL is required');

describe('manual resend', () => {
  let database: ReturnType<typeof createDatabase>;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let announcementId = '';

  beforeAll(async () => {
    const databaseUrl = await prepareTestDatabase(baseUrl);
    database = createDatabase(databaseUrl);
    await seedDatabase(database.db);
    const env = readApiEnv({
      DATABASE_URL: databaseUrl,
      WEB_ORIGIN: 'http://localhost:5173',
      AUTH_MODE: 'dev',
      DEV_USER_EMAIL: 'son_le_quoc_hung@wvi.org',
      MAIL_TRANSPORT: 'smtp',
      LOG_LEVEL: 'error',
    });
    app = await buildApp(env, database);
    const created = await app.inject({
      method: 'POST',
      url: '/api/announcements',
      payload: {
        title: 'Lịch gửi lại',
        bodyHtml: '<p>Nội dung</p>',
        groupIds: [SEED_IDS.groups.hn],
        startDate: '2026-12-01',
        startTime: '09:00',
        frequency: 'none',
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    announcementId = (created.json().announcement as { id: string }).id;
  });

  afterAll(async () => {
    await app.close();
    await database.pool.end();
  });

  async function insertDelivery(status: 'failed' | 'sent', minutesAgo: number) {
    const id = crypto.randomUUID();
    await database.db.insert(deliveries).values({
      id,
      announcementId,
      scheduledFor: new Date(Date.now() - minutesAgo * 60_000),
      status,
      attempts: 1,
      lastError: status === 'failed' ? 'Máy chủ mail từ chối thư' : null,
      recipientCount: 1,
    });
    return id;
  }

  it('queues one resend stamped with the current time', async () => {
    const failedId = await insertDelivery('failed', 30);
    const before = Date.now();
    const first = await app.inject({ method: 'POST', url: `/api/deliveries/${failedId}/retry` });
    expect(first.statusCode, first.body).toBe(201);
    const created = first.json().delivery as { id: string; scheduledFor: string };
    expect(new Date(created.scheduledFor).getTime()).toBeGreaterThanOrEqual(before - 1000);

    const rows = await database.db
      .select()
      .from(deliveries)
      .where(eq(deliveries.retryOf, failedId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('queued');
    expect(rows[0]?.announcementId).toBe(announcementId);

    const second = await app.inject({ method: 'POST', url: `/api/deliveries/${failedId}/retry` });
    expect(second.statusCode).toBe(409);
    expect(second.json().error).toBe('Lần gửi này đã được gửi lại');

    const listed = await app.inject({ method: 'GET', url: '/api/deliveries' });
    const items = listed.json().deliveries as { id: string; retried: boolean; retryOf: string }[];
    expect(items.find((item) => item.id === failedId)?.retried).toBe(true);
    expect(items.find((item) => item.id === created.id)?.retryOf).toBe(failedId);

    const audit = await database.db.select().from(auditLog).where(eq(auditLog.action, 'retry'));
    expect(audit.length).toBeGreaterThanOrEqual(1);
  });

  it('accepts only one of two simultaneous resends', async () => {
    const failedId = await insertDelivery('failed', 20);
    const results = await Promise.all([
      app.inject({ method: 'POST', url: `/api/deliveries/${failedId}/retry` }),
      app.inject({ method: 'POST', url: `/api/deliveries/${failedId}/retry` }),
    ]);
    expect(results.map((result) => result.statusCode).sort()).toEqual([201, 409]);
  });

  it('refuses to resend a delivery that did not fail', async () => {
    const sentId = await insertDelivery('sent', 10);
    const response = await app.inject({ method: 'POST', url: `/api/deliveries/${sentId}/retry` });
    expect(response.statusCode).toBe(409);
  });

  it('refuses a viewer', async () => {
    const failedId = await insertDelivery('failed', 5);
    const response = await app.inject({
      method: 'POST',
      url: `/api/deliveries/${failedId}/retry`,
      headers: { 'x-dev-user-email': 'minh.viewer@phat-tin.local' },
    });
    expect(response.statusCode).toBe(403);
  });
});
