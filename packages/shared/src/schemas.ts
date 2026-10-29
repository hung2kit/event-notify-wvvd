import { z } from 'zod';
import { FREQUENCIES, isValidDate, isValidTime } from './calendar.js';

export type { Frequency } from './calendar.js';

export const frequencySchema = z.enum(FREQUENCIES);

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Chọn ngày gửi đầu tiên')
  .refine(isValidDate, 'Chọn ngày gửi đầu tiên');

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Chọn giờ gửi')
  .refine(isValidTime, 'Chọn giờ gửi');

const emailListSchema = (label: string) =>
  z
    .array(
      z
        .string()
        .trim()
        .toLowerCase()
        .email('Địa chỉ email không hợp lệ')
        .max(254, 'Địa chỉ email quá dài'),
    )
    .max(50, `Tối đa 50 địa chỉ ${label}`)
    .default([]);

export const announcementWriteSchema = z
  .object({
    title: z.string().trim().min(1, 'Nhập tiêu đề email').max(200, 'Tiêu đề tối đa 200 ký tự'),
    bodyHtml: z
      .string()
      .trim()
      .min(1, 'Nhập nội dung email')
      .max(2_000_000, 'Nội dung quá dài (ảnh nên dưới 1,5 MB mỗi tệp)'),
    groupIds: z.array(z.string().uuid('Nhóm nhận không hợp lệ')).default([]),
    recipientEmails: emailListSchema('nhập tay'),
    ccEmails: emailListSchema('CC'),
    bccEmails: emailListSchema('BCC'),
    startDate: dateSchema,
    startTime: timeSchema,
    frequency: frequencySchema,
    untilDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày ngừng không hợp lệ')
      .refine(isValidDate, 'Ngày ngừng không hợp lệ')
      .nullable()
      .optional(),
    isActive: z.boolean().optional().default(false),
  })
  .superRefine((value, context) => {
    if (value.groupIds.length === 0 && value.recipientEmails.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['groupIds'],
        message: 'Chọn nhóm nhận hoặc nhập ít nhất một địa chỉ email',
      });
    }
    if (value.frequency !== 'none' && value.untilDate && value.untilDate < value.startDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['untilDate'],
        message: 'Ngày ngừng phải sau ngày gửi đầu tiên',
      });
    }
  });

export const announcementUpdateSchema = announcementWriteSchema.and(
  z.object({
    version: z.number().int().positive('Phiên bản thông báo không hợp lệ'),
  }),
);

export const toggleActiveSchema = z.object({
  isActive: z.boolean(),
});

export const announcementListQuerySchema = z.object({
  status: z.enum(['all', 'on', 'off']).default('all'),
  q: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
  sort: z.enum(['next', 'title']).default('next'),
});

export const previewQuerySchema = z
  .object({
    start: dateSchema,
    time: timeSchema,
    frequency: frequencySchema,
    until: z
      .string()
      .optional()
      .transform((value) => (value ? value : undefined)),
  })
  .superRefine((value, context) => {
    if (value.until && !isValidDate(value.until)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['until'],
        message: 'Ngày ngừng không hợp lệ',
      });
    }
    if (value.frequency !== 'none' && value.until && value.until < value.start) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['until'],
        message: 'Ngày ngừng phải sau ngày gửi đầu tiên',
      });
    }
  });

const daySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày không hợp lệ')
  .refine(isValidDate, 'Ngày không hợp lệ');

export const deliveryListQuerySchema = z
  .object({
    from: daySchema.optional(),
    to: daySchema.optional(),
    status: z.enum(['queued', 'sending', 'sent', 'failed', 'skipped']).optional(),
  })
  .superRefine((value, context) => {
    if (value.from && value.to && value.to < value.from) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: 'Ngày kết thúc phải sau ngày bắt đầu',
      });
    }
  });

export type AnnouncementWrite = z.infer<typeof announcementWriteSchema>;
export type AnnouncementUpdate = z.infer<typeof announcementUpdateSchema>;
export type ToggleActive = z.infer<typeof toggleActiveSchema>;
export type AnnouncementListQuery = z.infer<typeof announcementListQuerySchema>;
export type PreviewQuery = z.infer<typeof previewQuerySchema>;
export type DeliveryListQuery = z.infer<typeof deliveryListQuerySchema>;
