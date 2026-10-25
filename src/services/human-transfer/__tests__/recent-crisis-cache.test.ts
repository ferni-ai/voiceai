/**
 * The per-turn crisis check queries crisis_signals about once a minute, not once
 * a turn, and under CALL_START_TRIM a slow query no longer holds the turn.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  let next: () => Promise<{ docs: Array<{ data: () => unknown }> }> = async () => ({ docs: [] });
  const query = vi.fn(() => next());
  const add = vi.fn(async () => undefined);
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    get: query,
    add,
  });
  const db = { collection: () => ({ doc: () => ({ collection: () => chain }) }) };
  return {
    db,
    query,
    add,
    answer: (fn: typeof next) => {
      next = fn;
    },
  };
});

vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => fake.db }));
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { forgetRecentCrisis, hadRecentCrisis, logCrisisSignal } from '../index.js';
import { buildCrisisHistoryInjection } from '../../../agents/processors/injection-builders/better-than-human-builders.js';

/** A crisis_signals doc as logCrisisSignal writes it, at crisis level. */
const crisisDoc = {
  data: () => ({
    timestamp: new Date().toISOString(),
    signals: { suicidalIdeation: true, severity: 8 },
  }),
};

describe('recent crisis check', () => {
  beforeEach(() => {
    fake.query.mockClear();
    fake.answer(async () => ({ docs: [] }));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('queries once for many turns of one call', async () => {
    for (let turn = 0; turn < 5; turn++) await hadRecentCrisis('u-turns', 7);
    expect(fake.query).toHaveBeenCalledTimes(1);
    forgetRecentCrisis('u-turns');
  });

  it('sees a crisis signal logged during the call on the next turn', async () => {
    expect((await hadRecentCrisis('u-record', 7)).hasCrisis).toBe(false);
    fake.answer(async () => ({ docs: [crisisDoc] }));
    await logCrisisSignal('u-record', {
      suicidalIdeation: true,
      selfHarmIndicators: false,
      domesticViolence: false,
      dangerToOthers: false,
      severity: 8,
    } as never);
    expect(fake.add).toHaveBeenCalled();
    expect((await hadRecentCrisis('u-record', 7)).hasCrisis).toBe(true);
    expect(fake.query).toHaveBeenCalledTimes(2);
    forgetRecentCrisis('u-record');
  });

  it('does not keep a failed query', async () => {
    fake.answer(async () => {
      throw new Error('UNAVAILABLE');
    });
    expect((await hadRecentCrisis('u-flaky', 7)).hasCrisis).toBe(false);
    fake.answer(async () => ({ docs: [crisisDoc] }));
    expect((await hadRecentCrisis('u-flaky', 7)).hasCrisis).toBe(true);
    forgetRecentCrisis('u-flaky');
  });

  it('CALL_START_TRIM=on: a slow query soft-fails the turn, the next turn gets the answer', async () => {
    vi.stubEnv('CALL_START_TRIM', 'on');
    let release!: () => void;
    fake.answer(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ docs: [crisisDoc] });
        })
    );

    const started = Date.now();
    expect(await buildCrisisHistoryInjection('u-slow')).toBeNull();
    expect(Date.now() - started).toBeLessThan(1_000);

    release();
    const nextTurn = await buildCrisisHistoryInjection('u-slow');
    expect(nextTurn?.content).toContain('CRISIS FOLLOW-UP');
    expect(fake.query).toHaveBeenCalledTimes(1);
    forgetRecentCrisis('u-slow');
  });

  it('CALL_START_TRIM off (default): the turn waits for the query, as before', async () => {
    fake.answer(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ docs: [crisisDoc] }), 300);
        })
    );
    const injection = await buildCrisisHistoryInjection('u-default');
    expect(injection?.content).toContain('CRISIS FOLLOW-UP');
    forgetRecentCrisis('u-default');
  });
});
