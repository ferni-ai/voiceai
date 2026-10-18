/**
 * A wave over the in-memory queue: exactly N in order, idempotent per wave id,
 * the guard and pause, and seats that lapse back to the pool.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuardReading } from '../capacity-guard.js';
import { joinWaitlist, waitlistDocId } from '../join.js';
import { runWave, scheduledWaveId } from '../wave.js';
import { memoryStore } from './memory-store.js';
import { memoryWaveStore } from './memory-wave-store.js';

const { alerts } = vi.hoisted(() => ({ alerts: [] as string[] }));
vi.mock('../../platform/ops-alert.js', () => ({
  opsAlert: (key: string) => void alerts.push(key),
}));

const DAY = 86_400_000;
const T0 = new Date('2026-09-01T12:00:00Z');
const NOW = new Date('2026-10-19T17:00:00Z');
const OK: GuardReading = { state: 'ok', costUsd: 12, costDay: null, errorRate: 0.01, reasons: [] };

async function world(
  people: string[],
  settings: Record<string, unknown> = {},
  profiles = new Map<string, Record<string, unknown>>()
) {
  // prettier-ignore
  const q = memoryStore();
  for (const [i, name] of people.entries()) {
    const out = await joinWaitlist(q.store, { email: `${name}@example.com`, verified: true, source: 't', now: new Date(T0.getTime() + i * DAY) }); // prettier-ignore
    if ('refused' in out) throw new Error(out.refused);
  }
  const w = memoryWaveStore(q.docs, settings, profiles);
  const run = (id: string, guard: GuardReading = OK, opts: { dryRun?: boolean; now?: Date } = {}) =>
    runWave({ store: w.store, guard: async () => guard, now: opts.now ?? NOW, dryRun: opts.dryRun ?? false }, id); // prettier-ignore
  const doc = (name: string) => q.docs.get(waitlistDocId(`${name}@example.com`))!;
  return { q, w, run, doc };
}

beforeEach(() => void (alerts.length = 0));

describe('a wave', () => {
  it('admits exactly N, in queue order, with a 7-day seat and the founding perk of that wave', async () => {
    const { run, doc } = await world(['a', 'b', 'c', 'd', 'e'], { waveSize: 3 });
    const report = await run(scheduledWaveId(NOW));
    expect(report).toMatchObject({ waveId: '2026-10-19', wave: 1, admitted: 3 });
    for (const n of ['a', 'b', 'c']) {
      expect(doc(n)).toMatchObject({ status: 'admitted', foundingWaveMember: true, foundingWave: 1, inQueue: false }); // prettier-ignore
      expect((doc(n).seatExpiresAt as Date).getTime() - NOW.getTime()).toBe(7 * DAY);
    }
    expect(doc('d')).toMatchObject({ status: 'pending', inQueue: true });
    expect(doc('d').foundingWaveMember).toBeUndefined();
  });

  it('is idempotent per wave id: a retry admits nobody new, a crash mid-wave tops up to N', async () => {
    const { run, doc, w } = await world(['a', 'b', 'c', 'd', 'e'], { waveSize: 2 });
    await run('2026-10-19');
    expect(await run('2026-10-19')).toMatchObject({ skipped: 'already-ran', admitted: 0 });
    expect(doc('c').status).toBe('pending');

    // A run that crashed after one admit: its lease has expired, so the next run re-claims and tops up
    const crashed = await w.store.claimWave('2026-10-22', NOW, new Date(NOW.getTime() - 1));
    await w.store.admitOne((await w.store.nextInLine(1))[0]!, crashed, 2, NOW);
    expect(await run('2026-10-22')).toMatchObject({ wave: 2, admitted: 2 });
    expect([doc('c').status, doc('d').status, doc('e').status]).toEqual(['admitted', 'admitted', 'pending']); // prettier-ignore
  });

  it('a dry run writes nothing', async () => {
    const { run, q, w } = await world(['a', 'b'], { waveSize: 5 });
    const before = JSON.stringify([...q.docs]);
    expect(await run('2026-10-19', OK, { dryRun: true })).toMatchObject({ admitted: 2, dryRun: true }); // prettier-ignore
    expect(JSON.stringify([...q.docs])).toBe(before);
    expect(w.waves.size).toBe(0);
  });
});

describe('capacity guard and pause', () => {
  it('skips the wave when cost or call errors are over the ceiling, and records why', async () => {
    const { run, doc, w } = await world(['a', 'b']);
    const costly: GuardReading = { state: 'tripped', costUsd: 61, costDay: null, errorRate: 0.01, reasons: ['cost'] }; // prettier-ignore
    expect(await run('2026-10-19', costly)).toMatchObject({ skipped: 'guard', admitted: 0 });
    expect(w.waves.get('2026-10-19')).toMatchObject({ status: 'skipped', skippedReason: 'guard', guardReasons: ['cost'] }); // prettier-ignore
    expect(doc('a').status).toBe('pending');

    const failing: GuardReading = { state: 'tripped', costUsd: 5, costDay: null, errorRate: 0.08, reasons: ['error-rate'] }; // prettier-ignore
    expect(await run('2026-10-19', failing)).toMatchObject({ skipped: 'guard' });
    expect(await run('2026-10-19')).toMatchObject({ wave: 1, admitted: 2 }); // a later clean run still goes
  });

  it('runs when a signal is unmeasured, and alerts the operator', async () => {
    const { run } = await world(['a']);
    const blind: GuardReading = { state: 'unmeasured', costUsd: null, costDay: null, errorRate: 0.01, reasons: ['cost-unmeasured'] }; // prettier-ignore
    expect(await run('2026-10-19', blind)).toMatchObject({ admitted: 1 });
    expect(alerts).toEqual(['waitlist-wave-guard']);
  });

  it('skips while paused in settings', async () => {
    const { run, doc } = await world(['a'], { paused: true });
    expect(await run('2026-10-19')).toMatchObject({ skipped: 'paused', admitted: 0 });
    expect(doc('a').status).toBe('pending');
  });
});

describe('a seat nobody claims', () => {
  it('lapses after 7 days back to the pool, behind the people already waiting', async () => {
    const { run, doc } = await world(['a', 'b', 'c'], { waveSize: 1 });
    await run('2026-10-19');
    expect(doc('a').status).toBe('admitted');

    const later = new Date(NOW.getTime() + 8 * DAY);
    const report = await run(scheduledWaveId(later), OK, { now: later });
    expect(report).toMatchObject({ lapsed: 1, admitted: 1 });
    expect(doc('a')).toMatchObject({ status: 'lapsed', inQueue: true });
    expect(doc('a').foundingWaveMember).toBeUndefined();
    expect(doc('b').status).toBe('admitted'); // the next in line got the seat, not a again
    expect(doc('a').priorityKey as number).toBeGreaterThan(doc('c').priorityKey as number);
  });
});

describe('overlapping runs (review)', () => {
  it('two concurrent runs of the same wave admit exactly N: the second finds the lease held', async () => {
    const { run, q } = await world(['a', 'b', 'c', 'd', 'e', 'f'], { waveSize: 3 });
    const [one, two] = await Promise.all([run('2026-10-19'), run('2026-10-19')]);
    expect([one.skipped, two.skipped].filter((x) => x === 'busy')).toHaveLength(1);
    expect([...q.docs.values()].filter((d) => d.status === 'admitted')).toHaveLength(3);
  });

  it('admission re-reads the count: a wave already at N admits nobody, even with people in line', async () => {
    const { w, doc } = await world(['a', 'b'], { waveSize: 1 });
    const wave = await w.store.claimWave('2026-10-19', NOW, new Date(NOW.getTime() + 60_000));
    const [first, second] = await w.store.nextInLine(5);
    expect(await w.store.admitOne(first!, wave, 1, NOW)).toBe('admitted');
    expect(await w.store.admitOne(second!, wave, 1, NOW)).toBe('full');
    expect(doc('b').status).toBe('pending');
  });

  it('admission re-reads the person: someone no longer in line (admitted by another run) is skipped', async () => {
    const { w, doc } = await world(['a'], { waveSize: 5 });
    const wave = await w.store.claimWave('2026-10-19', NOW, new Date(NOW.getTime() + 60_000));
    const [stale] = await w.store.nextInLine(1);
    doc('a').inQueue = false; // another run got there first
    doc('a').status = 'admitted';
    expect(await w.store.admitOne(stale!, wave, 5, NOW)).toBe('skipped');
    expect(w.waves.get('2026-10-19')?.admitted).toBe(0);
  });
});

describe('members with an active profile (review)', () => {
  const active = (name: string) => [Buffer.from(`${name}@example.com`).toString('base64').replace(/[/+=]/g, '_'), { subscription: { tier: 'free', status: 'active' } }] as const; // prettier-ignore

  it('the wave marks them joined instead of giving them a seat, and the seat goes to the next person', async () => {
    const { run, doc } = await world(['a', 'b'], { waveSize: 1 }, new Map([active('a')]));
    expect(await run('2026-10-19')).toMatchObject({ admitted: 1, members: 1 });
    expect(doc('a')).toMatchObject({ status: 'joined', inQueue: false });
    expect(doc('b').status).toBe('admitted');
  });

  it('a lapsing seat held by a member is marked joined, never put back in line', async () => {
    const profiles = new Map<string, Record<string, unknown>>();
    const { run, doc } = await world(['a', 'b'], { waveSize: 1 }, profiles);
    await run('2026-10-19');
    profiles.set(...active('a')); // signed in on another path; the seat was never marked joined
    const later = new Date(NOW.getTime() + 8 * DAY);
    expect(await run(scheduledWaveId(later), OK, { now: later })).toMatchObject({ lapsed: 0, members: 1 }); // prettier-ignore
    expect(doc('a')).toMatchObject({ status: 'joined', inQueue: false });
  });
});
