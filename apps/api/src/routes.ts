import { createDatabase, users } from '@event-notify/db';
import {
  announcementListQuerySchema,
  deliveryListQuerySchema,
  previewQuerySchema,
  toggleActiveSchema,
  upcomingOccurrences,
  announcementUpdateSchema,
  announcementWriteSchema,
} from '@event-notify/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { type Actor } from './auth.js';
import type { ApiEnv } from './env.js';
import { HttpError, parseInput } from './http.js';
import {
  createAnnouncement,
  deleteAnnouncement,
  getAnnouncement,
  listAnnouncements,
  listDeliveries,
  listGroups,
  retryDelivery,
  setAnnouncementActive,
  stats,
  testSend,
  updateAnnouncement,
} from './store.js';

type Database = ReturnType<typeof createDatabase>;

const idParams = z.object({
  id: z.string().uuid('Thông báo không hợp lệ'),
});

export function registerApi(app: FastifyInstance, env: ApiEnv, database: Database): void {
  app.get('/api/me', async (request) => {
    const actor = request.actor;
    if (!actor) return { user: null };
    return { user: actor };
  });

  app.get('/api/dev/users', async () => {
    if (env.AUTH_MODE !== 'dev') throw new HttpError(404, 'Không có');
    const rows = await database.db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
      })
      .from(users);
    const rank = { admin: 0, editor: 1, viewer: 2 } as const;
    const known: {
      id: string;
      email: string;
      displayName: string;
      role: keyof typeof rank;
    }[] = [];
    for (const row of rows) {
      if (row.role !== 'admin' && row.role !== 'editor' && row.role !== 'viewer') continue;
      known.push({
        id: row.id,
        email: row.email,
        displayName: row.displayName,
        role: row.role,
      });
    }
    known.sort(
      (left, right) =>
        rank[left.role] - rank[right.role] ||
        left.displayName.localeCompare(right.displayName, 'vi'),
    );
    return { users: known };
  });

  app.get('/api/announcements', async (request) => {
    const query = parseInput(announcementListQuerySchema, request.query);
    return { announcements: await listAnnouncements(database.db, query) };
  });

  app.get('/api/announcements/preview', async (request) => {
    const query = parseInput(previewQuerySchema, request.query);
    const occurrences = upcomingOccurrences(
      {
        startDate: query.start,
        time: query.time,
        frequency: query.frequency,
        untilDate: query.frequency === 'none' ? null : (query.until ?? null),
      },
      { count: 4 },
    );
    return {
      occurrences: occurrences.map((item) => ({
        at: item.at.toISOString(),
        localDate: item.localDate,
        localTime: item.localTime,
      })),
    };
  });

  app.post('/api/announcements', async (request, reply) => {
    const actor = requireActor(request.actor);
    const input = parseInput(announcementWriteSchema, request.body);
    const announcement = await createAnnouncement(database.db, actor, input);
    return reply.code(201).send({ announcement });
  });

  app.get('/api/announcements/:id', async (request) => {
    const { id } = parseInput(idParams, request.params);
    return { announcement: await getAnnouncement(database.db, id) };
  });

  app.put('/api/announcements/:id', async (request) => {
    const actor = requireActor(request.actor);
    const { id } = parseInput(idParams, request.params);
    const input = parseInput(announcementUpdateSchema, request.body);
    return { announcement: await updateAnnouncement(database.db, actor, id, input) };
  });

  app.delete('/api/announcements/:id', async (request, reply) => {
    const actor = requireActor(request.actor);
    const { id } = parseInput(idParams, request.params);
    await deleteAnnouncement(database.db, actor, id);
    return reply.code(204).send();
  });

  app.patch('/api/announcements/:id/active', async (request) => {
    const actor = requireActor(request.actor);
    const { id } = parseInput(idParams, request.params);
    const input = parseInput(toggleActiveSchema, request.body);
    return setAnnouncementActive(database.db, actor, id, input.isActive);
  });

  app.post('/api/announcements/:id/test-send', async (request) => {
    const actor = requireActor(request.actor);
    const { id } = parseInput(idParams, request.params);
    return testSend(database.db, env, actor, id, request.log);
  });

  app.get('/api/deliveries', async (request) => {
    const query = parseInput(deliveryListQuerySchema, request.query);
    return { deliveries: await listDeliveries(database.db, query) };
  });

  app.post('/api/deliveries/:id/retry', async (request, reply) => {
    const actor = requireActor(request.actor);
    const { id } = parseInput(idParams, request.params);
    const delivery = await retryDelivery(database.db, actor, id);
    return reply.status(201).send({ delivery });
  });

  app.get('/api/groups', async () => {
    return { groups: await listGroups(database.db) };
  });

  app.get('/api/stats', async () => {
    return stats(database.db);
  });
}

function requireActor(actor: Actor | undefined): Actor {
  if (!actor) throw new HttpError(401, 'Chưa đăng nhập');
  return actor;
}
