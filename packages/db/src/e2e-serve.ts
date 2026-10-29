import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRootEnv } from './load-env.js';

/**
 * Starts an API, worker, and Vite that talk to Mailpit and database `phattin_e2e`.
 * Process env is set before the apps load `.env`, so the Outlook password is not used.
 */
loadRootEnv();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const baseUrl = process.env.DATABASE_URL;
if (!baseUrl) {
  console.error('Thiếu DATABASE_URL. Hãy chạy docker compose up -d postgres.');
  process.exit(1);
}

const databaseUrl = new URL(baseUrl);
databaseUrl.pathname = '/phattin_e2e';
const e2eUrl = databaseUrl.toString();

const childEnv: NodeJS.ProcessEnv = {
  ...process.env,
  DATABASE_URL: e2eUrl,
  API_PORT: '3100',
  WEB_ORIGIN: 'http://127.0.0.1:4173',
  AUTH_MODE: 'dev',
  DEV_USER_EMAIL: 'son_le_quoc_hung@wvi.org',
  SEED_ON_BOOT: 'true',
  MAIL_TRANSPORT: 'smtp',
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: '1025',
  SMTP_SECURE: 'false',
  SMTP_REQUIRE_TLS: 'false',
  SMTP_USER: '',
  SMTP_PASS: '',
  MAIL_FROM_ADDRESS: 'phat-tin@example.com',
  MAIL_FROM_NAME: 'Event Notify',
  MAIL_USE_BCC: 'false',
  VITE_API_PROXY: 'http://127.0.0.1:3100',
  SCHEDULER_INTERVAL_SECONDS: '15',
};

const children: ChildProcess[] = [];
let stopping = false;

function stop(code: number): void {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 800);
}

function start(args: string[]): void {
  const child = spawn('pnpm', args, { cwd: root, env: childEnv, stdio: 'inherit' });
  children.push(child);
  child.on('error', (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on('exit', (code) => {
    if (stopping || code === 0 || code === null) return;
    console.error(`Tiến trình thoát với mã ${code}: pnpm ${args.join(' ')}`);
    stop(code);
  });
}

async function waitFor(url: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Hết giờ khi chờ ${url}`);
}

async function prepareDatabase(): Promise<void> {
  const admin = new pg.Client({ connectionString: baseUrl });
  try {
    await admin.connect();
  } catch {
    throw new Error('Không kết nối được Postgres. Hãy chạy docker compose up -d postgres.');
  }
  const existing = await admin.query('select 1 from pg_database where datname = $1', [
    'phattin_e2e',
  ]);
  if (existing.rowCount === 0) await admin.query('create database phattin_e2e');
  await admin.end();
}

async function clearSchedules(): Promise<void> {
  const client = new pg.Client({ connectionString: e2eUrl });
  await client.connect();
  await client.query(`
    truncate table audit_log, deliveries, announcement_groups, announcements
    restart identity cascade
  `);
  const jobs = await client.query<{ name: string | null }>('select to_regclass($1) as name', [
    'pgboss.job',
  ]);
  if (jobs.rows[0]?.name) {
    await client.query('delete from pgboss.job');
    await client.query('delete from pgboss.archive');
  }
  await client.end();
}

process.on('SIGTERM', () => stop(0));
process.on('SIGINT', () => stop(0));

try {
  await prepareDatabase();
  console.log('e2e api http://127.0.0.1:3100');
  start(['--filter', '@phat-tin/api', 'start']);
  // /health stays down until the worker creates the pg-boss schema.
  await waitFor('http://127.0.0.1:3100/api/me');
  await clearSchedules();
  console.log('e2e worker smtp 127.0.0.1:1025');
  start(['--filter', '@phat-tin/worker', 'start']);
  await waitFor('http://127.0.0.1:3100/health/worker');
  console.log('e2e web http://127.0.0.1:4173');
  start([
    '--filter',
    '@phat-tin/web',
    'exec',
    '--',
    'vite',
    '--host',
    '127.0.0.1',
    '--port',
    '4173',
    '--strictPort',
  ]);
  await new Promise(() => undefined);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  stop(1);
}
