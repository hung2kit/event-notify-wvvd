import { describe, expect, it } from 'vitest';
import { announcementWriteSchema } from './schemas.js';

const base = {
  title: 'Thông báo',
  bodyHtml: '<p>Nội dung</p>',
  startDate: '2026-12-01',
  startTime: '08:00',
  frequency: 'none' as const,
};
const groupId = '018f6b10-7c3a-7a21-8000-000000000102';

describe('announcementWriteSchema recipients', () => {
  it('accepts a selected group without typed addresses', () => {
    const parsed = announcementWriteSchema.parse({ ...base, groupIds: [groupId] });
    expect(parsed.recipientEmails).toEqual([]);
  });

  it('accepts typed addresses without a group and normalizes case', () => {
    const parsed = announcementWriteSchema.parse({
      ...base,
      recipientEmails: [' Lan@WVI.org '],
    });
    expect(parsed.groupIds).toEqual([]);
    expect(parsed.recipientEmails).toEqual(['lan@wvi.org']);
  });

  it('defaults CC and BCC to empty and rejects an invalid CC address', () => {
    const parsed = announcementWriteSchema.parse({ ...base, groupIds: [groupId] });
    expect(parsed.ccEmails).toEqual([]);
    expect(parsed.bccEmails).toEqual([]);
    const bad = announcementWriteSchema.safeParse({
      ...base,
      groupIds: [groupId],
      ccEmails: ['khong-hop-le'],
    });
    expect(bad.success).toBe(false);
  });

  it('rejects a schedule with only CC or BCC', () => {
    const result = announcementWriteSchema.safeParse({ ...base, bccEmails: ['lan@wvi.org'] });
    expect(result.success).toBe(false);
  });

  it('rejects a schedule with no recipients', () => {
    const result = announcementWriteSchema.safeParse(base);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      'Chọn nhóm nhận hoặc nhập ít nhất một địa chỉ email',
    );
  });

  it('rejects an invalid typed address', () => {
    const result = announcementWriteSchema.safeParse({
      ...base,
      recipientEmails: ['not-an-email'],
    });
    expect(result.success).toBe(false);
  });
});
