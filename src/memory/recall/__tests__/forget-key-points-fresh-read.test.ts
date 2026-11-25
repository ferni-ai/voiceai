/**
 * The call-end summary writers' check (checkedPoints, checkedText: what
 * realtime-memory and last-call-summary store as the profile's last summary)
 * honours a topic forgotten on another process's call (#2755, FORGET_FRESH_READ).
 *
 * This test is process 2. Process 1's forget is the store's topics changing
 * underneath (the stored-topics read starts returning "divorce") with no
 * forgetTopic here, so nothing in this process bumps the forget generation or
 * the in-process list, and process 1's forget-time summary clear has already
 * run. A first check primes the shared 15 s topics cache; the forget lands 5 s
 * later; this call's summary is then checked before it is written.
 * Off: the cached list (no "divorce") lets the summary be written (main).
 * On: the store is read again and the forgotten point is not written.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const storeRead = vi.hoisted(() => ({ topics: [] as string[] | null, calls: 0 }));
vi.mock('../forget.js', async (original) => {
  const real = await original<typeof import('../forget.js')>();
  return {
    ...real,
    forgottenTopicsOrNull: async () => {
      storeRead.calls++;
      return storeRead.topics && [...storeRead.topics];
    },
  };
});

import { checkedPoints, checkedText } from '../forget-key-points.js';
import { resetForgetTopicsSource } from '../forget-topics-source.js';

const T0 = 8_000_000;
const USER = 'uid-2755-summary';
const POINTS = ['went over the divorce papers', 'planning the spring garden'];

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  resetForgetTopicsSource();
  storeRead.topics = [];
  storeRead.calls = 0;
});

/** Prime the cache at T0; process 1 forgets "divorce" at T0+5 s; check this call's summary. */
async function forgetInOtherProcessThenSummarize() {
  vi.useFakeTimers({ toFake: ['Date'], now: T0 });
  storeRead.topics = [];
  expect(await checkedPoints(USER, POINTS)).toEqual(POINTS);

  vi.setSystemTime(T0 + 5_000); // well inside the 15 s cache
  storeRead.topics = ['divorce']; // written by process 1; nothing in this process knows
  return {
    points: await checkedPoints(USER, POINTS),
    text: await checkedText(USER, 'we went over the divorce papers'),
  };
}

describe('last-summary and a forget made in another process (#2755)', () => {
  it('off: the cached list lets the forgotten summary be written (main)', async () => {
    vi.stubEnv('FORGET_FRESH_READ', 'off');
    const { points, text } = await forgetInOtherProcessThenSummarize();
    expect(points).toEqual(POINTS);
    expect(text).toBe('we went over the divorce papers');
    expect(storeRead.calls).toBe(1);
  });

  it('on: the store is read before the write, so the forgotten point is left out', async () => {
    vi.stubEnv('FORGET_FRESH_READ', 'on');
    const { points, text } = await forgetInOtherProcessThenSummarize();
    expect(points).toEqual(['planning the spring garden']);
    expect(text).toBe('');
    expect(storeRead.calls).toBe(3);
  });

  it('on: an unreadable store writes nothing (fail closed)', async () => {
    vi.stubEnv('FORGET_FRESH_READ', 'on');
    storeRead.topics = null;
    expect(await checkedPoints(USER, POINTS)).toEqual([]);
    expect(await checkedText(USER, 'planning the spring garden')).toBe('');
  });
});
