import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export function createDatabase(connectionString: string) {
  const pool = new pg.Pool({ connectionString });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export type AppDatabase = ReturnType<typeof createDatabase>['db'];

export async function checkDatabase(pool: pg.Pool): Promise<boolean> {
  try {
    await pool.query('select 1');
    return true;
  } catch {
    return false;
  }
}

/** True when pg-boss has created its schema and the queue table can be read. */
export async function checkQueue(pool: pg.Pool): Promise<boolean> {
  try {
    const result = await pool.query<{ ready: boolean }>(
      `select exists (
         select 1
         from information_schema.tables
         where table_schema = 'pgboss' and table_name = 'queue'
       ) as ready`,
    );
    if (result.rows[0]?.ready !== true) return false;
    await pool.query('select 1 from pgboss.queue limit 1');
    return true;
  } catch {
    return false;
  }
}
