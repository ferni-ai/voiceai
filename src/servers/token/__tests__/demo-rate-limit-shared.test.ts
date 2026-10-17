/**
 * The demo limit used to live in each instance's memory, so two Cloud Run
 * instances each handed out the full daily allowance. Two limiters sharing one
 * store must count together; a store failure falls back to the in-memory limit.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DemoLimitCounters } from '../demo-rate-limit.js';

vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => null }));

const { createSharedDemoLimiter, isSharedDemoLimitOn, peekDemoAllowance, reserveDemoSession } =
  await import('../demo-rate-limit-shared.js');
type DemoLimitStore = Parameters<typeof createSharedDemoLimiter>[0];

/** One shared document map, as Firestore would be for every instance. */
function fakeStore(): DemoLimitStore & { docs: Map<string, DemoLimitCounters> } {
  const docs = new Map<string, DemoLimitCounters>();
  return {
    docs,
    async read(key) {
      return docs.get(key) ?? null;
    },
    async change(key, fn) {
      const { next, result } = fn(docs.get(key) ?? null);
      if (next) docs.set(key, next);
      return result;
    },
  };
}

const failingStore: DemoLimitStore = {
  read: async () => {
    throw new Error('UNAVAILABLE');
  },
  change: async () => {
    throw new Error('UNAVAILABLE');
  },
};

// No cooldown so the daily count is what's measured
const config = { maxSessionsPerDay: 3, sessionDurationMinutes: 3, cooldownMinutes: 0 };

describe('shared demo limiter', () => {
  it('counts demos across two instances sharing one store', async () => {
    const store = fakeStore();
    const instanceA = createSharedDemoLimiter(store, config);
    const instanceB = createSharedDemoLimiter(store, config);

    expect((await instanceA.reserve('1.2.3.4')).sessionsRemaining).toBe(2);
    expect((await instanceB.reserve('1.2.3.4')).sessionsRemaining).toBe(1);
    expect((await instanceA.reserve('1.2.3.4')).sessionsRemaining).toBe(0);

    const fourth = await instanceB.reserve('1.2.3.4');
    expect(fourth.allowed).toBe(false);
    expect(fourth.reason).toBe('daily_limit');
    expect((await instanceA.peek('1.2.3.4')).allowed).toBe(false);
    // Another IP is untouched
    expect((await instanceB.peek('5.6.7.8')).allowed).toBe(true);
  });

  it('keys the store by a hash, never the raw IP', async () => {
    const store = fakeStore();
    await createSharedDemoLimiter(store, config).reserve('1.2.3.4');
    const [key] = [...store.docs.keys()];
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it('enforces the cooldown from another instance', async () => {
    const store = fakeStore();
    const cooled = { ...config, cooldownMinutes: 5 };
    await createSharedDemoLimiter(store, cooled).reserve('9.9.9.9');
    const second = await createSharedDemoLimiter(store, cooled).reserve('9.9.9.9');
    expect(second.allowed).toBe(false);
    expect(second.reason).toBe('cooldown');
  });

  it('starts a fresh count on a new day', async () => {
    const store = fakeStore();
    const limiter = createSharedDemoLimiter(store, config);
    await limiter.reserve('7.7.7.7');
    const [key] = [...store.docs.keys()];
    store.docs.set(key, { dayStart: 0, sessionCount: 3, lastSession: 1 });
    expect((await limiter.reserve('7.7.7.7')).sessionsRemaining).toBe(2);
  });

  it('falls back to the in-memory limit when the store fails', async () => {
    const limiter = createSharedDemoLimiter(failingStore, config);
    const results = [
      await limiter.reserve('3.3.3.3'),
      await limiter.reserve('3.3.3.3'),
      await limiter.reserve('3.3.3.3'),
      await limiter.reserve('3.3.3.3'),
    ];
    // This instance's memory still enforces the daily limit
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[3].reason).toBe('daily_limit');
    expect((await limiter.peek('3.3.3.3')).allowed).toBe(false);
  });
});

describe('DEMO_RATE_LIMIT_SHARED flag', () => {
  const saved = process.env.DEMO_RATE_LIMIT_SHARED;
  beforeEach(() => {
    delete process.env.DEMO_RATE_LIMIT_SHARED;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.DEMO_RATE_LIMIT_SHARED;
    else process.env.DEMO_RATE_LIMIT_SHARED = saved;
  });

  it('is off by default and limits in memory', async () => {
    expect(isSharedDemoLimitOn()).toBe(false);
    expect((await reserveDemoSession('10.0.0.1')).allowed).toBe(true);
    expect((await reserveDemoSession('10.0.0.1')).reason).toBe('cooldown');
    expect((await peekDemoAllowance('10.0.0.1')).allowed).toBe(false);
  });

  it('on, with Firestore unavailable, still limits (in-memory fallback)', async () => {
    process.env.DEMO_RATE_LIMIT_SHARED = 'true';
    expect(isSharedDemoLimitOn()).toBe(true);
    expect((await reserveDemoSession('10.0.0.2')).allowed).toBe(true);
    expect((await reserveDemoSession('10.0.0.2')).allowed).toBe(false);
  });
});
