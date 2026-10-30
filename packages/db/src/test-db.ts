import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { createDatabase } from './client.js';

/** Isolated database so worker tests do not send the schedules in the dev database. */
export function testDatabaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.pathname = '/eventnotify_test';
  return url.toString();
}

export async function prepareTestDatabase(baseUrl: string): Promise<string> {
  const admin = new pg.Client({ connectionString: baseUrl });
  await admin.connect();
  const existing = await admin.query('select 1 from pg_database where datname = $1', [
    'eventnotify_test',
  ]);
  if (existing.rowCount === 0) {
    await admin.query('create database eventnotify_test');
  }
  await admin.end();

  const url = testDatabaseUrl(baseUrl);
  const database = createDatabase(url);
  const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../drizzle');
  await migrate(database.db, { migrationsFolder });
  await database.pool.end();
  return url;
}

export async function resetTestData(pool: pg.Pool): Promise<void> {
  await pool.query(`
    truncate table
      audit_log,
      deliveries,
      announcement_groups,
      announcements,
      recipient_groups,
      users,
      scheduler_state
    restart identity cascade
  `);
  const tables = await pool.query<{ table_name: string }>(
    `select table_name
     from information_schema.tables
     where table_schema = 'pgboss' and table_name = any($1::text[])`,
    [['job', 'archive']],
  );
  for (const row of tables.rows) {
    if (row.table_name === 'job' || row.table_name === 'archive') {
      await pool.query(`delete from pgboss.${row.table_name}`);
    }
  }
}
