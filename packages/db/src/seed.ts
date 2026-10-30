import { inArray, sql } from 'drizzle-orm';
import type { AppDatabase } from './client.js';
import { SEED_IDS } from './ids.js';
import {
  announcementGroups,
  announcements,
  auditLog,
  deliveries,
  recipientGroups,
  schedulerState,
  users,
} from './schema.js';

const demoAnnouncementIds = Object.values(SEED_IDS.announcements);

/**
 * Keeps the dev user and the recipient groups.
 * Demo announcements and their history are removed so schedules are created from the app.
 */
export async function seedDatabase(db: AppDatabase): Promise<void> {
  const parked = {
    description: 'Nhóm mẫu đã ẩn. Danh sách phân phối thật sẽ được gắn sau.',
    memberCount: 1,
    isActive: false,
  };
  const groups = [
    {
      id: SEED_IDS.groups.hn,
      name: 'Email cá nhân',
      description: 'Hộp thư dùng để thử gửi. Nhóm phân phối (ví dụ VNMO_allWV) sẽ được gắn sau.',
      emailAddress: 'son_le_quoc_hung@wvi.org',
      memberCount: 1,
      isActive: true,
    },
    {
      id: SEED_IDS.groups.all,
      name: 'Toàn văn phòng quốc gia',
      emailAddress: 'wv-vn-all@worldvision.org.vn',
      ...parked,
    },
    {
      id: SEED_IDS.groups.adp,
      name: 'Các vùng chương trình (ADP)',
      emailAddress: 'wv-vn-adp@worldvision.org.vn',
      ...parked,
    },
    {
      id: SEED_IDS.groups.fin,
      name: 'Phòng Tài chính',
      emailAddress: 'wv-vn-finance@worldvision.org.vn',
      ...parked,
    },
    {
      id: SEED_IDS.groups.comms,
      name: 'Truyền thông và Gây quỹ',
      emailAddress: 'wv-vn-comms@worldvision.org.vn',
      ...parked,
    },
    {
      id: SEED_IDS.groups.lead,
      name: 'Ban điều hành',
      emailAddress: 'wv-vn-leadership@worldvision.org.vn',
      ...parked,
    },
  ];

  const people = [
    {
      id: SEED_IDS.user,
      email: 'son_le_quoc_hung@wvi.org',
      displayName: 'Hạnh',
      role: 'admin',
    },
    {
      id: SEED_IDS.editor,
      email: 'lan.editor@event-notify.local',
      displayName: 'Lan',
      role: 'editor',
    },
    {
      id: SEED_IDS.viewer,
      email: 'minh.viewer@event-notify.local',
      displayName: 'Minh',
      role: 'viewer',
    },
  ];

  await db.transaction(async (tx) => {
    for (const person of people) {
      await tx
        .insert(users)
        .values(person)
        .onConflictDoUpdate({
          target: users.id,
          set: {
            email: sql`excluded.email`,
            displayName: sql`excluded.display_name`,
            role: sql`excluded.role`,
          },
        });
    }

    for (const group of groups) {
      await tx
        .insert(recipientGroups)
        .values(group)
        .onConflictDoUpdate({
          target: recipientGroups.id,
          set: {
            name: group.name,
            description: group.description,
            emailAddress: group.emailAddress,
            memberCount: group.memberCount,
            isActive: group.isActive,
          },
        });
    }

    await tx.delete(auditLog).where(inArray(auditLog.announcementId, demoAnnouncementIds));
    await tx.delete(deliveries).where(inArray(deliveries.announcementId, demoAnnouncementIds));
    await tx
      .delete(announcementGroups)
      .where(inArray(announcementGroups.announcementId, demoAnnouncementIds));
    await tx.delete(announcements).where(inArray(announcements.id, demoAnnouncementIds));

    await tx
      .insert(schedulerState)
      .values({ id: 'worker', lastTickAt: null })
      .onConflictDoNothing();
  });

  console.log('seeded dev users (admin, editor, viewer) and recipient groups');
}
