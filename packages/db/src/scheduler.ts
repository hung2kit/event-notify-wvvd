import { eq } from 'drizzle-orm';
import type { AppDatabase } from './client.js';
import { schedulerState } from './schema.js';

const WORKER_ROW_ID = 'worker';

export async function readSchedulerTick(db: AppDatabase): Promise<Date | null> {
  const rows = await db
    .select({ lastTickAt: schedulerState.lastTickAt })
    .from(schedulerState)
    .where(eq(schedulerState.id, WORKER_ROW_ID))
    .limit(1);
  return rows[0]?.lastTickAt ?? null;
}

export async function recordSchedulerTick(db: AppDatabase, at: Date = new Date()): Promise<void> {
  await db
    .insert(schedulerState)
    .values({ id: WORKER_ROW_ID, lastTickAt: at })
    .onConflictDoUpdate({
      target: schedulerState.id,
      set: { lastTickAt: at },
    });
}
