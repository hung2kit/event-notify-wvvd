import { describe, expect, it } from 'vitest';
import { buildRrule, upcomingOccurrences } from './recurrence.js';

const at = (local: string) => new Date(`${local}:00+07:00`);
const dates = (
  startDate: string,
  time: string,
  frequency: Parameters<typeof upcomingOccurrences>[0]['frequency'],
  extra?: { untilDate?: string | null; from?: Date; count?: number },
) =>
  upcomingOccurrences(
    { startDate, time, frequency, untilDate: extra?.untilDate },
    { from: extra?.from, count: extra?.count },
  ).map((item) => item.localDate);

describe('upcomingOccurrences', () => {
  it('sends a one-time announcement once when the start is still ahead', () => {
    expect(
      dates('2026-05-01', '09:00', 'none', { from: at('2026-01-01T00:00'), count: 4 }),
    ).toEqual(['2026-05-01']);
  });

  it('skips a one-time announcement whose start has passed', () => {
    expect(dates('2026-01-01', '09:00', 'none', { from: at('2026-02-01T00:00') })).toEqual([]);
  });

  it('walks daily and keeps the wall-clock time in Ho Chi Minh', () => {
    const rows = upcomingOccurrences(
      { startDate: '2026-01-30', time: '14:00', frequency: 'daily' },
      { from: at('2026-01-01T00:00'), count: 3 },
    );
    expect(rows.map((row) => row.localDate)).toEqual(['2026-01-30', '2026-01-31', '2026-02-01']);
    expect(rows[0]?.at.toISOString()).toBe('2026-01-30T07:00:00.000Z');
    expect(rows[0]?.localTime).toBe('14:00');
  });

  it('sends on Monday to Friday and skips the weekend', () => {
    expect(
      dates('2026-10-30', '09:00', 'weekdays', { from: at('2026-10-01T00:00'), count: 4 }),
    ).toEqual(['2026-10-30', '2026-11-02', '2026-11-03', '2026-11-04']);
  });

  it('moves a weekend start to the next weekday', () => {
    expect(
      dates('2026-10-31', '09:00', 'weekdays', { from: at('2026-10-01T00:00'), count: 1 }),
    ).toEqual(['2026-11-02']);
  });

  it('repeats weekly on the same weekday', () => {
    expect(
      dates('2026-01-07', '08:30', 'weekly', { from: at('2026-01-10T00:00'), count: 2 }),
    ).toEqual(['2026-01-14', '2026-01-21']);
  });

  it('falls back to the last day when a monthly date does not exist', () => {
    expect(
      dates('2026-01-31', '08:30', 'monthly', { from: at('2026-01-01T00:00'), count: 4 }),
    ).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
    expect(
      dates('2024-01-31', '08:30', 'monthly', { from: at('2024-01-01T00:00'), count: 3 }),
    ).toEqual(['2024-01-31', '2024-02-29', '2024-03-31']);
    expect(
      dates('2026-01-30', '08:30', 'monthly', { from: at('2026-01-01T00:00'), count: 3 }),
    ).toEqual(['2026-01-30', '2026-02-28', '2026-03-30']);
  });

  it('sends a yearly 29 February reminder on 28 February in other years', () => {
    const rows = upcomingOccurrences(
      { startDate: '2024-02-29', time: '09:00', frequency: 'yearly' },
      { from: at('2024-01-01T00:00'), count: 5 },
    );
    expect(rows.map((row) => row.localDate)).toEqual([
      '2024-02-29',
      '2025-02-28',
      '2026-02-28',
      '2027-02-28',
      '2028-02-29',
    ]);
    expect(rows[0]?.at.toISOString()).toBe('2024-02-29T02:00:00.000Z');
  });

  it('includes the until date and stops after it', () => {
    expect(
      dates('2026-01-01', '08:00', 'daily', {
        untilDate: '2026-01-03',
        from: at('2025-12-01T00:00'),
        count: 10,
      }),
    ).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
  });

  it('does not back-fill occurrences that already passed', () => {
    expect(
      dates('2026-03-01', '08:30', 'daily', { from: at('2026-03-15T10:00'), count: 2 }),
    ).toEqual(['2026-03-16', '2026-03-17']);
    expect(
      dates('2026-03-01', '08:30', 'daily', { from: at('2026-03-15T08:30'), count: 1 }),
    ).toEqual(['2026-03-15']);
  });
});

describe('buildRrule', () => {
  it('names the original month day and the Ho Chi Minh start', () => {
    const rule = buildRrule({
      startDate: '2026-01-31',
      time: '08:30',
      frequency: 'monthly',
      untilDate: '2026-06-30',
    });
    expect(rule).toContain('DTSTART;TZID=Asia/Ho_Chi_Minh:20260131T083000');
    expect(rule).toContain('FREQ=MONTHLY');
    expect(rule).toContain('BYMONTHDAY=31');
    expect(rule).toContain('UNTIL=');
  });

  it('limits a one-time send to a single count', () => {
    expect(buildRrule({ startDate: '2026-05-01', time: '09:00', frequency: 'none' })).toContain(
      'COUNT=1',
    );
  });
});
