import { describe, expect, it } from 'vitest';
import { formatCivil } from '../date-math.js';
import { defaultReminderRule } from '../record.js';
import {
  isQuietNow,
  planNextReminder,
  quietHoursEnd,
  reminderKey,
  sendInstantFor,
  withHandledKey,
  type ScheduleContext,
} from '../reminder-schedule.js';
import { DEFAULT_REMINDER_SETTINGS, type ImportantDateRecord } from '../types.js';

const record = (over: Partial<ImportantDateRecord> = {}): ImportantDateRecord => ({
  id: 'date_x',
  key: 'birthday:sam',
  title: "Sam's birthday",
  date: '--06-12',
  recurring: true,
  kind: 'birthday',
  source: 'user',
  sourceConversationIds: [],
  confidence: 1,
  reminders: defaultReminderRule('birthday'),
  nextReminderAt: null,
  nextReminderKey: null,
  sentReminderKeys: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
});

const ctx = (iso: string, over: Partial<ScheduleContext['settings']> = {}): ScheduleContext => ({
  timeZone: 'America/New_York',
  now: new Date(iso),
  settings: { ...DEFAULT_REMINDER_SETTINGS, ...over },
});

describe('planNextReminder', () => {
  it('plans the 7-day reminder at 09:00 local on the right day', () => {
    const plan = planNextReminder(record(), ctx('2026-05-01T12:00:00Z'))!;
    expect(plan.offset).toBe(7);
    expect(formatCivil(plan.remindOn)).toBe('2026-06-05');
    expect(plan.at.toISOString()).toBe('2026-06-05T13:00:00.000Z'); // 09:00 EDT
    expect(plan.key).toBe(reminderKey('date_x', 2026, 7));
  });

  it('moves to the next offset once one is handled, then to next year', () => {
    let r = record({ sentReminderKeys: ['date_x_2026_7'] });
    expect(planNextReminder(r, ctx('2026-06-05T14:00:00Z'))!.offset).toBe(1);
    r = record({ sentReminderKeys: ['date_x_2026_7', 'date_x_2026_1', 'date_x_2026_0'] });
    const plan = planNextReminder(r, ctx('2026-06-12T20:00:00Z'))!;
    expect(plan.key).toBe('date_x_2027_7');
    expect(formatCivil(plan.remindOn)).toBe('2027-06-05');
  });

  it('a date added late fires the closest reminder now and skips the earlier ones', () => {
    const plan = planNextReminder(record(), ctx('2026-06-09T15:00:00Z'))!; // 3 days before
    expect(plan.offset).toBe(7);
    expect(formatCivil(plan.remindOn)).toBe('2026-06-09');
    expect(plan.at.getTime()).toBeLessThanOrEqual(new Date('2026-06-09T15:00:00Z').getTime());
    const after = planNextReminder(
      record({ sentReminderKeys: [plan.key] }),
      ctx('2026-06-09T15:00:00Z')
    )!;
    expect(after.offset).toBe(1);
    expect(formatCivil(after.remindOn)).toBe('2026-06-11');
  });

  it('handles Feb 29 birthdays in non-leap years and year rollover', () => {
    const plan = planNextReminder(
      record({ date: '--02-29', reminders: { enabled: true, offsets: [0], custom: true } }),
      ctx('2026-12-30T12:00:00Z')
    )!;
    expect(formatCivil(plan.occursOn)).toBe('2027-02-28');
  });

  it('returns null when reminders are off or a one-off date has passed', () => {
    expect(
      planNextReminder(
        record({ reminders: { enabled: false, offsets: [1], custom: true } }),
        ctx('2026-05-01T12:00:00Z')
      )
    ).toBeNull();
    expect(
      planNextReminder(
        record({
          kind: 'deadline',
          date: '2026-04-01',
          recurring: false,
          reminders: defaultReminderRule('deadline'),
        }),
        ctx('2026-05-01T12:00:00Z')
      )
    ).toBeNull();
  });

  it('computes in the user time zone (late evening UTC is still "yesterday" in LA)', () => {
    const r = record({ reminders: { enabled: true, offsets: [0], custom: true } });
    const la: ScheduleContext = { ...ctx('2026-06-12T05:00:00Z'), timeZone: 'America/Los_Angeles' };
    const plan = planNextReminder(r, la)!; // still June 11 in LA
    expect(formatCivil(plan.remindOn)).toBe('2026-06-12');
    expect(plan.at.toISOString()).toBe('2026-06-12T16:00:00.000Z'); // 09:00 PDT
  });
});

describe('quiet hours', () => {
  it('moves a send time that falls in quiet hours to when they end', () => {
    const c = ctx('2026-06-01T12:00:00Z', {
      sendTime: '07:00',
      quietHours: { start: '22:00', end: '08:30' },
    });
    expect(sendInstantFor({ year: 2026, month: 6, day: 5 }, c).toISOString()).toBe(
      '2026-06-05T12:30:00.000Z'
    );
  });

  it('knows when it is quiet and when quiet ends', () => {
    const c = ctx('2026-06-02T03:00:00Z'); // 23:00 EDT
    expect(isQuietNow(c)).toBe(true);
    expect(quietHoursEnd(c).toISOString()).toBe('2026-06-02T12:00:00.000Z'); // 08:00 EDT
    expect(isQuietNow(ctx('2026-06-02T15:00:00Z'))).toBe(false);
  });
});

describe('withHandledKey', () => {
  it('dedupes and bounds the list', () => {
    const keys = Array.from({ length: 30 }, (_, i) => `k${i}`);
    const next = withHandledKey(keys, 'k29');
    expect(next).toHaveLength(24);
    expect(next[next.length - 1]).toBe('k29');
    expect(next.filter((k) => k === 'k29')).toHaveLength(1);
  });
});
