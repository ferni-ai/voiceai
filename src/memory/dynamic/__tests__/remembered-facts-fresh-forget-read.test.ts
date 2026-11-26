/**
 * The remembered-fact write guard honours a topic forgotten on another
 * process's call (#2755, FORGET_FRESH_READ).
 *
 * This test is process 2. Process 1's forget is the store's topics changing
 * underneath (the stored-topics read starts returning "Denver") with no
 * forgetTopic here, so nothing in this process bumps the forget generation or
 * the in-process list. A first write primes the shared 15 s topics cache; the
 * forget lands 5 s later; a fact about Denver is then remembered.
 * Off: the cached list (no "Denver") lets the write through (main).
 * On: the store is read again and the write is refused.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storeRead = vi.hoisted(() => ({ topics: [] as string[] | null, calls: 0 }));
vi.mock('../../recall/forget.js', async (original) => {
  const real = await original<typeof import('../../recall/forget.js')>();
  return {
    ...real,
    forgottenTopicsOrNull: async () => {
      storeRead.calls++;
      return storeRead.topics && [...storeRead.topics];
    },
  };
});

import { keepForRecall, type FactDocWrite } from '../remembered-facts.js';
import { useSecretModel } from '../../secret-check.js';
import { resetForgetTopicsSource } from '../../recall/forget-topics-source.js';

const create = vi.fn(async (_u: string, docs: FactDocWrite[]) => docs.length);
const deps = { store: { create }, contactData: () => false };
const T0 = 9_000_000;
const USER = 'uid-2755-remember';

beforeEach(() => {
  useSecretModel(async () => '{"secret":false}');
  vi.stubEnv('MEMORY_TOOLS_HONEST', 'on');
  vi.stubEnv('FORGET_EVERY_READER', '');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  useSecretModel(null);
  resetForgetTopicsSource();
  create.mockClear();
  storeRead.topics = [];
  storeRead.calls = 0;
});

/** Prime the cache at T0; process 1 forgets "Denver" at T0+5 s; remember a fact about Denver. */
async function forgetInOtherProcessThenRemember() {
  vi.useFakeTimers({ toFake: ['Date'], now: T0 });
  storeRead.topics = [];
  const first = await keepForRecall(USER, { fact: 'my sister moves to Boise' }, deps);
  expect(first.kind).toBe('kept');

  vi.setSystemTime(T0 + 5_000); // well inside the 15 s cache
  storeRead.topics = ['Denver']; // written by process 1; nothing in this process knows
  return keepForRecall(USER, { fact: 'the job offer in Denver came through' }, deps);
}

describe('remember-to-recall and a forget made in another process (#2755)', () => {
  it('off: the cached list lets the forgotten fact be written (main)', async () => {
    vi.stubEnv('FORGET_FRESH_READ', 'off');
    const got = await forgetInOtherProcessThenRemember();
    expect(got.kind).toBe('kept');
    expect(create).toHaveBeenCalledTimes(2);
    expect(storeRead.calls).toBe(1);
  });

  it('on: the store is read for the write, so the forgotten fact is refused', async () => {
    vi.stubEnv('FORGET_FRESH_READ', 'on');
    const got = await forgetInOtherProcessThenRemember();
    expect(got).toEqual({ kind: 'refused', reason: 'forgotten' });
    expect(create).toHaveBeenCalledTimes(1); // only the Boise fact
    expect(storeRead.calls).toBe(2);
  });

  it('on: an unreadable store fails the write closed', async () => {
    vi.stubEnv('FORGET_FRESH_READ', 'on');
    storeRead.topics = null;
    const got = await keepForRecall(USER, { fact: 'my sister moves to Boise' }, deps);
    expect(got).toEqual({ kind: 'failed' });
    expect(create).not.toHaveBeenCalled();
  });
});
