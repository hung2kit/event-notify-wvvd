import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from './client.js';
import { loadRootEnv } from './load-env.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  loadRootEnv();
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const { db, pool } = createDatabase(databaseUrl);
const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../drizzle');

await migrate(db, { migrationsFolder });
await pool.end();
console.log('migrations applied');
