import { toZonedTime } from 'date-fns-tz';
import type { Frequency } from '@phat-tin/shared/schema';

export const ZONE = 'Asia/Ho_Chi_Minh';
const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  none: 'Một lần',
  daily: 'Hằng ngày',
  weekdays: 'Ngày làm việc',
  weekly: 'Hằng tuần',
  monthly: 'Hằng tháng',
  yearly: 'Hằng năm',
};

export const FREQUENCY_OPTIONS: { value: Frequency; label: string }[] = [
  { value: 'none', label: 'Không lặp, gửi một lần' },
  { value: 'daily', label: 'Hằng ngày' },
  { value: 'weekdays', label: 'Các ngày làm việc (T2–T6)' },
  { value: 'weekly', label: 'Hằng tuần' },
  { value: 'monthly', label: 'Hằng tháng' },
  { value: 'yearly', label: 'Hằng năm' },
];

export function formatInstant(iso: string): { date: string; time: string; relative: string } {
  const zoned = toZonedTime(new Date(iso), ZONE);
  return {
    date: `${WEEKDAYS[zoned.getDay()]}, ${pad(zoned.getDate())}/${pad(zoned.getMonth() + 1)}/${zoned.getFullYear()}`,
    time: `${pad(zoned.getHours())}:${pad(zoned.getMinutes())}`,
    relative: relativeDays(dayNumber(zoned) - dayNumber(toZonedTime(new Date(), ZONE))),
  };
}

export function formatLocal(
  localDate: string,
  localTime: string,
): { date: string; time: string; relative: string } {
  const [year, month, day] = localDate.split('-').map(Number);
  const weekday = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1)).getUTCDay();
  const today = toZonedTime(new Date(), ZONE);
  return {
    date: `${WEEKDAYS[weekday]}, ${pad(day ?? 0)}/${pad(month ?? 0)}/${year}`,
    time: localTime,
    relative: relativeDays(
      Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1) / 86400000 - dayNumber(today),
    ),
  };
}

function dayNumber(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
}

function relativeDays(days: number): string {
  const rounded = Math.round(days);
  if (rounded === 0) return 'Hôm nay';
  if (rounded === 1) return 'Ngày mai';
  if (rounded > 1 && rounded < 7) return `${rounded} ngày nữa`;
  if (rounded >= 7 && rounded < 60) return `${Math.round(rounded / 7)} tuần nữa`;
  if (rounded >= 60) return `${Math.round(rounded / 30)} tháng nữa`;
  if (rounded === -1) return 'Hôm qua';
  return `${Math.abs(rounded)} ngày trước`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function hasContent(html: string): boolean {
  return Boolean(plainText(html) || /<img\b/i.test(html));
}
