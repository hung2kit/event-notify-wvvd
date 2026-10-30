import { createDatabase, loadRootEnv, seedDatabase } from '@event-notify/db';

loadRootEnv();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const { db, pool } = createDatabase(databaseUrl);
try {
  await seedDatabase(db);
} finally {
  await pool.end();
}
