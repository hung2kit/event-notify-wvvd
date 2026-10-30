import { createDatabase, loadRootEnv, seedDatabase } from '@event-notify/db';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createRequire } from 'node:module';
import path from 'node:path';
import { buildApp } from './app.js';
import { readApiEnv } from './env.js';

loadRootEnv();

const env = readApiEnv();
const database = createDatabase(env.DATABASE_URL);
const require = createRequire(import.meta.url);
const migrationsFolder = path.resolve(
  path.dirname(require.resolve('@event-notify/db')),
  '../drizzle',
);

await migrate(database.db, { migrationsFolder });

if (env.SEED_ON_BOOT) {
  await seedDatabase(database.db);
}

const app = await buildApp(env, database);

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await database.pool.end();
  process.exit(0);
};

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

try {
  await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
} catch (error) {
  app.log.error(error);
  await database.pool.end();
  process.exit(1);
}
