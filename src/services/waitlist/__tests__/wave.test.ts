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
const OK: GuardReading = { state: 'ok', costUsd: 12, errorRate: 0.01, reasons: [] };

async function world(people: string[], settings: Record<string, unknown> = {}) {
  const q = memoryStore();
  for (const [i, name] of people.entries()) {
    const out = await joinWaitlist(q.store, { email: `${name}@example.com`, verified: true, source: 't', now: new Date(T0.getTime() + i * DAY) }); // prettier-ignore
    if ('refused' in out) throw new Error(out.refused);
  }
  const w = memoryWaveStore(q.docs, settings);
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
      expect(doc(n)).toMatchObject({ status: 'admitted', foundingMember: true, foundingWave: 1, inQueue: false }); // prettier-ignore
      expect((doc(n).seatExpiresAt as Date).getTime() - NOW.getTime()).toBe(7 * DAY);
    }
    expect(doc('d')).toMatchObject({ status: 'pending', inQueue: true });
    expect(doc('d').foundingMember).toBeUndefined();
  });

  it('is idempotent per wave id: a retry admits nobody new, a crash mid-wave tops up to N', async () => {
    const { run, doc, w } = await world(['a', 'b', 'c', 'd', 'e'], { waveSize: 2 });
    await run('2026-10-19');
    expect(await run('2026-10-19')).toMatchObject({ skipped: 'already-ran', admitted: 0 });
    expect(doc('c').status).toBe('pending');

    w.waves.set('2026-10-22', { number: 2, status: 'running' }); // crashed after one admit
    await w.store.admit({ ...(await w.store.nextInLine(1))[0]! }, { id: '2026-10-22', number: 2, status: 'running' }, NOW); // prettier-ignore
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
    const costly: GuardReading = { state: 'tripped', costUsd: 61, errorRate: 0.01, reasons: ['cost'] }; // prettier-ignore
    expect(await run('2026-10-19', costly)).toMatchObject({ skipped: 'guard', admitted: 0 });
    expect(w.waves.get('2026-10-19')).toMatchObject({ status: 'skipped', skippedReason: 'guard', guardReasons: ['cost'] }); // prettier-ignore
    expect(doc('a').status).toBe('pending');

    const failing: GuardReading = { state: 'tripped', costUsd: 5, errorRate: 0.08, reasons: ['error-rate'] }; // prettier-ignore
    expect(await run('2026-10-19', failing)).toMatchObject({ skipped: 'guard' });
    expect(await run('2026-10-19')).toMatchObject({ wave: 1, admitted: 2 }); // a later clean run still goes
  });

  it('runs when a signal is unmeasured, and alerts the operator', async () => {
    const { run } = await world(['a']);
    const blind: GuardReading = { state: 'unmeasured', costUsd: null, errorRate: 0.01, reasons: ['cost-unmeasured'] }; // prettier-ignore
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
    expect(doc('a').foundingMember).toBeUndefined();
    expect(doc('b').status).toBe('admitted'); // the next in line got the seat, not a again
    expect(doc('a').priorityKey as number).toBeGreaterThan(doc('c').priorityKey as number);
  });
});
