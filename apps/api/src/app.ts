import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { checkDatabase, checkQueue, createDatabase, readSchedulerTick } from '@phat-tin/db';
import { WORKER_TICK_STALE_MS, type HealthReport, type WorkerHealthReport } from '@phat-tin/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import { currentUser } from './auth.js';
import type { ApiEnv } from './env.js';
import { HttpError } from './http.js';
import { registerApi } from './routes.js';

type Database = ReturnType<typeof createDatabase>;

export async function buildApp(env: ApiEnv, database: Database): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          '*.password',
          '*.SMTP_PASS',
          'SMTP_PASS',
          '*.clientSecret',
          '*.client_secret',
          'bodyHtml',
          'body_html',
          'bodyText',
          'body_text',
        ],
        remove: true,
      },
    },
  });

  await app.register(helmet);
  await app.register(cors, { origin: env.WEB_ORIGIN });
  await app.register(rateLimit, { max: 600, timeWindow: '1 minute' });

  app.addHook('preHandler', async (request) => {
    const path = request.url.split('?')[0] ?? '';
    if (!path.startsWith('/api')) return;
    const raw = request.headers['x-dev-user-email'];
    const header = Array.isArray(raw) ? raw[0] : raw;
    request.actor = await currentUser(database.db, env, header);
  });
  registerApi(app, env, database);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send({
        error: error.message,
        ...(error.fields ? { fields: error.fields } : {}),
        ...(error.detail ? { detail: error.detail } : {}),
      });
    }
    request.log.error({ err: error }, 'request failed');
    return reply.status(500).send({ error: 'Lỗi máy chủ' });
  });

  app.get('/health', async (_request, reply) => {
    const report = await readHealth(database.pool);
    return reply.code(report.status === 'ok' ? 200 : 503).send(report);
  });

  app.get('/health/worker', async (_request, reply) => {
    const report = await readWorkerHealth(database);
    return reply.code(report.status === 'ok' ? 200 : 503).send(report);
  });

  return app;
}

async function readHealth(pool: Database['pool']): Promise<HealthReport> {
  const [database, queue] = await Promise.all([checkDatabase(pool), checkQueue(pool)]);
  const checks = {
    database: database ? 'ok' : 'error',
    queue: queue ? 'ok' : 'error',
  } as const;
  return {
    status: checks.database === 'ok' && checks.queue === 'ok' ? 'ok' : 'error',
    checks,
  };
}

async function readWorkerHealth(database: Database): Promise<WorkerHealthReport> {
  try {
    const lastTickAt = await readSchedulerTick(database.db);
    if (!lastTickAt) {
      return { status: 'stale', lastTickAt: null, lagSeconds: null };
    }
    const lagMs = Date.now() - lastTickAt.getTime();
    return {
      status: lagMs <= WORKER_TICK_STALE_MS ? 'ok' : 'stale',
      lastTickAt: lastTickAt.toISOString(),
      lagSeconds: Math.max(0, Math.round(lagMs / 1000)),
    };
  } catch {
    return { status: 'stale', lastTickAt: null, lagSeconds: null };
  }
}
