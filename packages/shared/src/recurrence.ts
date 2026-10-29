import { createRequire } from 'node:module';
import type { Weekday } from 'rrule';
import { isValidDate, isValidTime, type Frequency } from './calendar.js';

const { RRule } = createRequire(import.meta.url)('rrule') as typeof import('rrule');

export { FREQUENCIES, isValidDate, isValidTime } from './calendar.js';
export type { Frequency } from './calendar.js';

/** Vietnam is UTC+7 all year. Schedule math must not depend on the server's timezone. */
const ZONE_OFFSET = '+07:00';
const MAX_STEPS = 4000;

export type ScheduleInput = {
  startDate: string;
  time: string;
  frequency: Frequency;
  untilDate?: string | null;
};

export type Occurrence = {
  /** UTC instant of this send. */
  at: Date;
  localDate: string;
  localTime: string;
};

type LocalDate = { year: number; month: number; day: number };

const WEEKDAY_RULE: Weekday[] = [
  RRule.SU,
  RRule.MO,
  RRule.TU,
  RRule.WE,
  RRule.TH,
  RRule.FR,
  RRule.SA,
];

/** Local wall time in Asia/Ho_Chi_Minh as a UTC instant. */
export function localToUtc(date: string, time: string): Date {
  return new Date(`${date}T${time}:00${ZONE_OFFSET}`);
}

/**
 * RFC 5545 string stored on the announcement.
 * DTSTART uses the Ho Chi Minh wall clock. Monthly and yearly rules name the
 * original day; `upcomingOccurrences` clamps that day onto shorter months.
 */
export function buildRrule(input: ScheduleInput): string {
  const start = parseDate(input.startDate);
  const [hour, minute] = parseTime(input.time);
  const options: Partial<ConstructorParameters<typeof RRule>[0]> = {};
  switch (input.frequency) {
    case 'none':
      options.freq = RRule.DAILY;
      options.count = 1;
      break;
    case 'daily':
      options.freq = RRule.DAILY;
      break;
    case 'weekdays':
      options.freq = RRule.WEEKLY;
      options.byweekday = [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR];
      break;
    case 'weekly':
      options.freq = RRule.WEEKLY;
      options.byweekday = [WEEKDAY_RULE[weekday(start)]!];
      break;
    case 'monthly':
      options.freq = RRule.MONTHLY;
      options.bymonthday = start.day;
      break;
    case 'yearly':
      options.freq = RRule.YEARLY;
      options.bymonth = start.month;
      options.bymonthday = start.day;
      break;
  }
  if (input.frequency !== 'none' && input.untilDate) {
    const until = parseDate(input.untilDate);
    options.until = new Date(Date.UTC(until.year, until.month - 1, until.day, 23, 59, 59));
  }
  const rule = new RRule(options).toString();
  const stamp = `${pad(start.year)}${pad(start.month)}${pad(start.day)}T${pad(hour)}${pad(minute)}00`;
  return `DTSTART;TZID=Asia/Ho_Chi_Minh:${stamp}\n${rule}`;
}

/**
 * Next occurrences at or after `from`. This is the only expansion the API and
 * the worker should use. `untilDate` is inclusive. A start in the past does
 * not back-fill missed sends.
 */
export function upcomingOccurrences(
  input: ScheduleInput,
  options: { from?: Date; count?: number } = {},
): Occurrence[] {
  const from = options.from ?? new Date();
  const count = options.count ?? 4;
  const start = parseDate(input.startDate);
  parseTime(input.time);
  const until = input.untilDate ? parseDate(input.untilDate) : null;
  if (until && compareDate(until, start) < 0) return [];

  const found: Occurrence[] = [];
  for (let step = 0; step < MAX_STEPS && found.length < count; step += 1) {
    const cursor = cursorAt(start, step, input.frequency);
    if (!cursor) break;
    if (until && compareDate(cursor, until) > 0) break;
    if (input.frequency === 'weekdays' && !isWeekday(cursor)) continue;
    const at = localToUtc(isoDate(cursor), input.time);
    if (at.getTime() < from.getTime()) continue;
    found.push({ at, localDate: isoDate(cursor), localTime: input.time });
  }
  return found;
}

export function nextRunAt(input: ScheduleInput, from: Date = new Date()): Date | null {
  return upcomingOccurrences(input, { from, count: 1 })[0]?.at ?? null;
}

function cursorAt(start: LocalDate, step: number, frequency: Frequency): LocalDate | null {
  if (frequency === 'none') return step === 0 ? start : null;
  if (frequency === 'daily' || frequency === 'weekdays') return addDays(start, step);
  if (frequency === 'weekly') return addDays(start, step * 7);
  if (frequency === 'monthly') return addMonths(start, step);
  return addYears(start, step);
}

function addMonths(start: LocalDate, months: number): LocalDate {
  const index = start.month - 1 + months;
  const year = start.year + Math.floor(index / 12);
  const month = (index % 12) + 1;
  return { year, month, day: Math.min(start.day, daysInMonth(year, month)) };
}

function addYears(start: LocalDate, years: number): LocalDate {
  const year = start.year + years;
  return { year, month: start.month, day: Math.min(start.day, daysInMonth(year, start.month)) };
}

function addDays(date: LocalDate, days: number): LocalDate {
  const utc = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1, day: utc.getUTCDate() };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function weekday(date: LocalDate): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

function isWeekday(date: LocalDate): boolean {
  const day = weekday(date);
  return day >= 1 && day <= 5;
}

function compareDate(left: LocalDate, right: LocalDate): number {
  return left.year - right.year || left.month - right.month || left.day - right.day;
}

function parseDate(iso: string): LocalDate {
  if (!isValidDate(iso)) throw new Error(`Invalid date ${iso}`);
  const [year, month, day] = iso.split('-').map(Number);
  return { year: year!, month: month!, day: day! };
}

function parseTime(time: string): [number, number] {
  if (!isValidTime(time)) throw new Error(`Invalid time ${time}`);
  const [hour, minute] = time.split(':').map(Number);
  return [hour!, minute!];
}

function isoDate(date: LocalDate): string {
  return `${pad(date.year)}-${pad(date.month)}-${pad(date.day)}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
