import { SEED_IDS, createDatabase, loadRootEnv, seedDatabase } from '@phat-tin/db';
import { prepareTestDatabase } from '@phat-tin/db/test-db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { readApiEnv } from './env.js';

loadRootEnv();

const baseUrl = process.env.DATABASE_URL;
if (!baseUrl) throw new Error('DATABASE_URL is required');

describe('announcement version', () => {
  let database: ReturnType<typeof createDatabase>;
  let app: Awaited<ReturnType<typeof buildApp>>;

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
  });

  afterAll(async () => {
    await app.close();
    await database.pool.end();
  });

  it('rejects an edit with a stale version', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/announcements',
      payload: {
        title: 'Lịch kiểm tra phiên bản',
        bodyHtml: '<p>Nội dung</p>',
        groupIds: [SEED_IDS.groups.hn],
        ccEmails: ['Minh@wvi.org', 'son_le_quoc_hung@wvi.org'],
        bccEmails: ['minh@wvi.org', 'hanh@wvi.org'],
        startDate: '2026-12-01',
        startTime: '09:00',
        frequency: 'none',
        isActive: true,
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    const announcement = created.json().announcement as {
      id: string;
      version: number;
      ccEmails: string[];
      bccEmails: string[];
    };
    expect(announcement.ccEmails).toEqual(['minh@wvi.org', 'son_le_quoc_hung@wvi.org']);
    expect(announcement.bccEmails).toEqual(['hanh@wvi.org']);

    const conflict = await app.inject({
      method: 'PUT',
      url: `/api/announcements/${announcement.id}`,
      payload: {
        title: 'Lịch kiểm tra phiên bản',
        bodyHtml: '<p>Nội dung sửa</p>',
        groupIds: [SEED_IDS.groups.hn],
        startDate: '2026-12-01',
        startTime: '09:00',
        frequency: 'none',
        isActive: true,
        version: announcement.version + 10,
      },
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error).toBe(
      'Thông báo đã được sửa bởi người khác. Tải lại trước khi lưu.',
    );
  });
});
