import { describe, expect, it } from 'vitest';
import {
  MAX_PER_POLL,
  MIN_INCUBATION_MS,
  NIGHT_SPAN_MINUTES,
  READY_LEAD_MS,
  hasNewCall,
  mergeDue,
  nextNightSlot,
  nightMinute,
  pickDue,
  ponderDueAt,
  typicalGapMs,
  zonedInstant,
  type DueEntry,
} from '../ponder-schedule.js';

const HOUR = 3_600_000;

/** Local wall-clock hour and minute of an instant in a zone. */
function localHm(at: Date, timeZone: string): [number, number] {
  const s = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at);
  const [h, m] = s.split(':').map(Number);
  return [h!, m!];
}

describe('night slot', () => {
  it('gives each caller a fixed minute spread across the window', () => {
    expect(nightMinute('vdSfkCCXaiXpnVCvgKxHMYrNFr72')).toBe(
      nightMinute('vdSfkCCXaiXpnVCvgKxHMYrNFr72')
    );
    const minutes = new Set(Array.from({ length: 200 }, (_, i) => nightMinute(`user-${i}`)));
    expect(minutes.size).toBeGreaterThan(100); // not piled onto a few minutes
    for (const m of minutes) expect(m).toBeLessThan(NIGHT_SPAN_MINUTES);
  });

  it("falls between 02:00 and 05:00 in the caller's own zone", () => {
    for (const zone of ['America/Denver', 'America/New_York', 'Asia/Tokyo', 'Australia/Adelaide']) {
      const slot = nextNightSlot(new Date('2026-10-10T18:00:00Z'), zone, 'caller-a');
      const [h] = localHm(slot, zone);
      expect(h, zone).toBeGreaterThanOrEqual(2);
      expect(h, zone).toBeLessThan(5);
    }
  });

  it('lands on the right local time across a DST change', () => {
    // US clocks fall back on 2026-11-01 at 02:00.
    const at = zonedInstant(
      { year: 2026, month: 11, day: 1, hour: 4, minute: 15 },
      'America/Denver'
    );
    expect(localHm(at, 'America/Denver')).toEqual([4, 15]);
    // ...and spring forward on 2026-03-08 at 02:00 (03:05 exists that day).
    const spring = zonedInstant(
      { year: 2026, month: 3, day: 8, hour: 3, minute: 5 },
      'America/New_York'
    );
    expect(localHm(spring, 'America/New_York')).toEqual([3, 5]);
  });
});

describe('ponderDueAt', () => {
  const uid = 'caller-a';

  it("sleeps on an evening call: overnight in the caller's zone, not two hours later", () => {
    const lastCallEnd = new Date('2026-10-11T02:00:00Z'); // 8pm in Denver
    const due = ponderDueAt({ lastCallEnd, timeZone: 'America/Denver', uid });
    const [h] = localHm(due, 'America/Denver');
    expect(h).toBeGreaterThanOrEqual(2);
    expect(h).toBeLessThan(5);
    expect(due.getTime() - lastCallEnd.getTime()).toBeLessThan(10 * HOUR); // that night
    expect(due.getTime() - lastCallEnd.getTime()).toBeGreaterThan(MIN_INCUBATION_MS);
  });

  it('never thinks it over sooner than the incubation time, even for a call at 1am', () => {
    const lastCallEnd = zonedInstant(
      { year: 2026, month: 10, day: 11, hour: 1, minute: 30 },
      'America/Denver'
    );
    const due = ponderDueAt({ lastCallEnd, timeZone: 'America/Denver', uid });
    expect(due.getTime() - lastCallEnd.getTime()).toBeGreaterThanOrEqual(MIN_INCUBATION_MS);
  });

  it("is ready before a frequent caller's usual next call", () => {
    const lastCallEnd = new Date('2026-10-10T15:00:00Z'); // 9am in Denver
    // Calls every four hours today.
    const recentCallEnds = ['03', '07', '11'].map((h) => new Date(`2026-10-10T${h}:00:00Z`));
    const gap = typicalGapMs([...recentCallEnds, lastCallEnd]);
    expect(gap).toBe(4 * HOUR);
    const due = ponderDueAt({ lastCallEnd, recentCallEnds, timeZone: 'America/Denver', uid });
    expect(due.getTime()).toBe(lastCallEnd.getTime() + 4 * HOUR - READY_LEAD_MS);
  });

  it('keeps the night slot for a caller who talks every few days', () => {
    const lastCallEnd = new Date('2026-10-11T02:00:00Z');
    const days = (n: number) => new Date(lastCallEnd.getTime() - n * 24 * HOUR);
    const due = ponderDueAt({
      lastCallEnd,
      recentCallEnds: [days(3), days(6)],
      timeZone: 'America/Denver',
      uid,
    });
    expect(due).toEqual(ponderDueAt({ lastCallEnd, timeZone: 'America/Denver', uid }));
  });

  it('falls back to UTC for a missing or bad zone', () => {
    const lastCallEnd = new Date('2026-10-10T20:00:00Z');
    const bad = ponderDueAt({ lastCallEnd, timeZone: 'Mars/Olympus', uid });
    expect(bad).toEqual(ponderDueAt({ lastCallEnd, uid }));
    expect(localHm(bad, 'UTC')[0]).toBeGreaterThanOrEqual(2);
  });
});

describe('queue', () => {
  const t = (iso: string) => new Date(iso);

  it('a second call pushes the queued pass later, never earlier', () => {
    expect(mergeDue(t('2026-10-11T09:00:00Z'), t('2026-10-11T10:00:00Z'))).toEqual(
      t('2026-10-11T10:00:00Z')
    );
    expect(mergeDue(t('2026-10-11T10:00:00Z'), t('2026-10-11T09:00:00Z'))).toEqual(
      t('2026-10-11T10:00:00Z')
    );
    expect(mergeDue(undefined, t('2026-10-11T09:00:00Z'))).toEqual(t('2026-10-11T09:00:00Z'));
  });

  it('only a call since the last pass gives something new to think about', () => {
    expect(hasNewCall({ lastCallEnd: t('2026-10-10T02:00:00Z') })).toBe(true);
    expect(
      hasNewCall({
        lastCallEnd: t('2026-10-10T02:00:00Z'),
        lastPonderedAt: t('2026-10-10T09:00:00Z'),
      })
    ).toBe(false);
    expect(
      hasNewCall({
        lastCallEnd: t('2026-10-10T12:00:00Z'),
        lastPonderedAt: t('2026-10-10T09:00:00Z'),
      })
    ).toBe(true);
  });

  it('picks due callers with something new, oldest first, capped', () => {
    const now = t('2026-10-11T10:00:00Z');
    const entry = (uid: string, due: string, pondered?: string): DueEntry => ({
      uid,
      dueAt: t(due),
      lastCallEnd: t('2026-10-11T02:00:00Z'),
      lastPonderedAt: pondered ? t(pondered) : undefined,
    });
    const picked = pickDue(
      [
        entry('later', '2026-10-11T09:00:00Z'),
        entry('not-yet', '2026-10-11T11:00:00Z'),
        entry('earlier', '2026-10-11T08:00:00Z'),
        entry('already', '2026-10-11T07:00:00Z', '2026-10-11T07:30:00Z'),
      ],
      now
    );
    expect(picked.map((e) => e.uid)).toEqual(['earlier', 'later']);

    const many = Array.from({ length: MAX_PER_POLL + 10 }, (_, i) =>
      entry(`u${i}`, '2026-10-11T09:00:00Z')
    );
    expect(pickDue(many, now)).toHaveLength(MAX_PER_POLL);
  });
});
