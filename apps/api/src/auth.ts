import { users, type AppDatabase } from '@phat-tin/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { ApiEnv } from './env.js';
import { HttpError } from './http.js';

declare module 'fastify' {
  interface FastifyRequest {
    actor?: Actor;
  }
}

export type Actor = {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'editor' | 'viewer';
};

export async function currentUser(
  db: AppDatabase,
  env: ApiEnv,
  devEmailHeader?: string,
): Promise<Actor> {
  if (env.AUTH_MODE !== 'dev') {
    throw new HttpError(401, 'Đăng nhập Microsoft sẽ có ở giai đoạn sau');
  }
  const requested = devEmailHeader?.trim();
  let email = env.DEV_USER_EMAIL;
  if (requested) {
    const parsed = z.string().email().safeParse(requested);
    if (!parsed.success) throw new HttpError(401, 'Không tìm thấy người dùng dev.');
    email = parsed.data;
  }
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  const user = rows[0];
  if (!user) {
    throw new HttpError(
      requested ? 401 : 500,
      requested
        ? 'Không tìm thấy người dùng dev.'
        : 'Không tìm thấy người dùng dev. Hãy chạy pnpm db:seed.',
    );
  }
  if (user.role !== 'admin' && user.role !== 'editor' && user.role !== 'viewer') {
    throw new HttpError(500, 'Vai trò người dùng không hợp lệ');
  }
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  };
}

export function assertCanWrite(actor: Actor): void {
  if (actor.role === 'viewer') throw new HttpError(403, 'Bạn chỉ có quyền xem');
}

export function assertCanEdit(actor: Actor, createdBy: string): void {
  if (actor.role === 'admin') return;
  if (actor.role === 'editor' && actor.id === createdBy) return;
  throw new HttpError(403, 'Bạn không có quyền sửa thông báo này');
}
