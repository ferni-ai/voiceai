import { describe, expect, it } from 'vitest';
import { buildPersonModel } from '../build.js';
import { buildFollowThrough, buildRhythms } from '../stats.js';
import { ago, inputs, NOW, summary } from './fixtures.js';

/** A call that ended at `hourUtc`:30 UTC, `daysAgo` days before NOW's date. */
const endedAt = (daysAgo: number, hourUtc: number) =>
  new Date(Date.UTC(2026, 9, 18 - daysAgo, hourUtc, 30)).toISOString();
/** Six 10-minute calls over 12 days, each ending 19:30 in New York (23:30 UTC, EDT). */
const evenings = [1, 3, 5, 7, 9, 12].map((d) => summary(d, { timestamp: endedAt(d, 23) }));

describe('rhythms', () => {
  it('finds their usual hour in their own zone and a window to reach them', () => {
    const r = buildRhythms(inputs({ summaries: evenings }), NOW).value;
    const usual = r.usualHours.find((u) => u.dow === 'any');
    // Calls began 19:20 local (end minus the 600 s duration).
    expect(usual && usual.startHour <= 19 && usual.endHour > 19).toBe(true);
    expect(usual?.share).toBe(1);
    expect(r.reachWindows).toHaveLength(1);
    expect(r.reachWindows[0].startHour).toBe(usual?.startHour);
    expect(r.callsLast30d).toBe(6);
    expect(r.medianMinutes).toBe(10);
    expect(r.medianGapDays).toBe(2);
    expect(r.lastCallAt).toBe(endedAt(1, 23));
    expect(r.timezone).toBe('America/New_York');
  });

  it('reads hours in UTC without a zone', () => {
    const r = buildRhythms(inputs({ summaries: evenings, timezone: null }), NOW).value;
    const usual = r.usualHours.find((u) => u.dow === 'any');
    expect(usual && usual.startHour <= 23 && (usual.endHour > 23 || usual.endHour < 2)).toBe(true);
  });

  it('never offers a reach window in quiet hours', () => {
    // Calls ending 22:30 New York: they call late, but nothing goes out after 21:00.
    const late = [1, 2, 3, 4, 5].map((d) =>
      summary(d, { timestamp: endedAt(d - 1, 2), duration: 60 })
    );
    const r = buildRhythms(inputs({ summaries: late }), NOW).value;
    expect(r.usualHours.length).toBeGreaterThan(0);
    expect(r.reachWindows).toEqual([]);
  });

  it('honours their own quiet window too', () => {
    const quiet = { startMin: 18 * 60, endMin: 20 * 60 };
    const r = buildRhythms(inputs({ summaries: evenings, quiet }), NOW).value;
    expect(r.reachWindows).toEqual([]);
  });

  it('claims no usual time from too few calls', () => {
    const r = buildRhythms(inputs({ summaries: evenings.slice(0, 4) }), NOW).value;
    expect(r.usualHours).toEqual([]);
    expect(r.reachWindows).toEqual([]);
  });

  it('is wired into the model with its sources', () => {
    const m = buildPersonModel(inputs({ summaries: evenings }), NOW);
    expect(m.rhythms.prov.builtAt).toBe(NOW.toISOString());
    expect(m.rhythms.prov.sources).toEqual(['summaries']);
  });
});

describe('followThrough', () => {
  const commitments = [
    { status: 'completed', createdAt: NOW.getTime() - 5 * 86_400_000 },
    { status: 'completed', createdAt: NOW.getTime() - 6 * 86_400_000 },
    { status: 'abandoned', createdAt: NOW.getTime() - 7 * 86_400_000 },
    { status: 'abandoned', createdAt: NOW.getTime() - 8 * 86_400_000 },
    { status: 'active', createdAt: NOW.getTime() - 9 * 86_400_000 },
    { status: 'completed', createdAt: NOW.getTime() - 90 * 86_400_000 }, // outside 60 days
  ];
  const ferni = [
    { type: 'follow_up', fulfilled: true, outcome: 'kept', madeAt: ago(3), commitment: 'x' },
    { type: 'check_in', fulfilled: false, outcome: 'missed', madeAt: ago(10), dueBy: ago(8) },
    { type: 'follow_up', fulfilled: false, outcome: 'missed', madeAt: ago(12), dueBy: ago(9) },
    { type: 'remind', fulfilled: false, madeAt: ago(1), dueBy: ago(-2) },
    { type: 'remember', fulfilled: false, madeAt: ago(1) }, // not an action owed
  ];

  it('counts how each kind ends, falling back to commitments while follow_through is empty', () => {
    const f = buildFollowThrough(inputs({ commitments, ferniCommitments: ferni }), NOW);
    expect(f.value.byKind.commitment).toEqual({ opened: 5, done: 2, slipped: 2 });
    expect(f.value.byKind.promise).toEqual({ opened: 4, done: 1, slipped: 2 });
    expect(f.value.slips).toEqual(['promises']);
    expect(f.value.ferniPromisesOpen).toBe(1);
    expect(f.value.ferniPromisesMissed30d).toBe(2);
    expect(f.prov.sources).toEqual(['commitments', 'ferni_commitments']);
  });

  it('reads follow_through when it has items: released is no slip, overdue is', () => {
    const followThrough = [
      { kind: 'reminder', status: 'done', createdAt: ago(2) },
      { kind: 'reminder', status: 'released', createdAt: ago(2) },
      { kind: 'reminder', status: 'open', dueAt: ago(1), createdAt: ago(4) },
      { kind: 'reminder', status: 'expired', createdAt: ago(5) },
      { kind: 'nonsense', status: 'done', createdAt: ago(5) },
    ];
    const f = buildFollowThrough(inputs({ followThrough, commitments }), NOW);
    expect(f.value.byKind).toEqual({ reminder: { opened: 3, done: 1, slipped: 2 } });
    expect(f.prov.sources[0]).toBe('follow_through');
  });

  it('says nothing about fewer than three items', () => {
    const f = buildFollowThrough(inputs({ commitments: commitments.slice(0, 2) }), NOW);
    expect(f.value.byKind).toEqual({});
    expect(f.value.slips).toEqual([]);
  });
});
