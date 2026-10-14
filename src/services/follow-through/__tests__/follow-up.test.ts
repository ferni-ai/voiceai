import { describe, expect, it } from 'vitest';
import { apply, isClosed, nextOccurrence } from '../follow-up.js';
import { followUp, NY } from './fixtures.js';

const NOW = new Date('2026-10-13T16:05:00.000Z');

function ok<T>(r: { success: true; data: T } | { success: false; error: string }): T {
  if (!r.success) throw new Error(r.error);
  return r.data;
}

describe('apply', () => {
  it('surfacing records when and how, and marks it surfaced', () => {
    const f = ok(apply(followUp(), { type: 'surface', via: 'text' }, NOW));
    expect(f.status).toBe('surfaced');
    expect(f.surfaced).toEqual([{ at: NOW.toISOString(), via: 'text' }]);
    expect(f.updatedAt).toBe(NOW.toISOString());
  });

  it('done closes a one-off', () => {
    const f = ok(apply(followUp({ status: 'surfaced' }), { type: 'done' }, NOW));
    expect(f.status).toBe('done');
    expect(f.closedAt).toBe(NOW.toISOString());
    expect(isClosed(f)).toBe(true);
  });

  it('done on a repeating one reopens it for the next time, in the caller zone', () => {
    const daily = followUp({ kind: 'dose', repeat: { every: 'day', at: '08:00' } });
    const f = ok(apply(daily, { type: 'done' }, NOW));
    expect(f.status).toBe('open');
    // 8am New York on the 14th
    expect(f.dueAt).toBe('2026-10-14T12:00:00.000Z');
    expect(isClosed(f)).toBe(false);
  });

  it('replan moves the due time and reopens it', () => {
    const f = ok(
      apply(
        followUp({ status: 'surfaced' }),
        { type: 'replan', dueAt: '2026-10-14T22:00:00.000Z' },
        NOW
      )
    );
    expect(f.status).toBe('open');
    expect(f.dueAt).toBe('2026-10-14T22:00:00.000Z');
  });

  it('rejects a replan to a time that is not a time', () => {
    expect(apply(followUp(), { type: 'replan', dueAt: 'tomorrowish' }, NOW).success).toBe(false);
  });

  it('release and expire both close it', () => {
    expect(ok(apply(followUp(), { type: 'release' }, NOW)).status).toBe('released');
    expect(ok(apply(followUp(), { type: 'expire' }, NOW)).status).toBe('expired');
  });

  it('a closed follow-up takes no more events, so nothing raises it again', () => {
    for (const status of ['done', 'released', 'expired'] as const) {
      const r = apply(followUp({ status }), { type: 'surface', via: 'opener' }, NOW);
      expect(r.success).toBe(false);
    }
  });
});

describe('nextOccurrence', () => {
  it('is later today when the time has not come yet', () => {
    // 11:00 New York on the 13th; 18:30 the same day
    const at = nextOccurrence({ every: 'day', at: '18:30' }, NY, new Date('2026-10-13T15:00:00Z'));
    expect(at.toISOString()).toBe('2026-10-13T22:30:00.000Z');
  });

  it('is a week on for a weekly one already past today', () => {
    const at = nextOccurrence({ every: 'week', at: '09:00' }, NY, new Date('2026-10-13T15:00:00Z'));
    expect(at.toISOString()).toBe('2026-10-20T13:00:00.000Z');
  });

  it('keeps the local time across the clock change', () => {
    // 9am New York on 2 Nov is after DST ends: 14:00 UTC, not 13:00
    const at = nextOccurrence({ every: 'day', at: '09:00' }, NY, new Date('2026-11-01T15:00:00Z'));
    expect(at.toISOString()).toBe('2026-11-02T14:00:00.000Z');
  });

  it('puts a 29 February birthday on the 28th in a non-leap year', () => {
    const at = nextOccurrence({ every: 'year', at: '09:00' }, NY, new Date('2028-02-29T20:00:00Z'));
    expect(at.toISOString()).toBe('2029-02-28T14:00:00.000Z');
  });
});
