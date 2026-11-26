/**
 * The caller card's forget read (callerCardPorts().forgotten) with FORGET_FRESH_READ: from the
 * store itself, so a forget another process stored just before this persona's setup counts inside
 * the shared 15 s cache (#2755); a late or failed read gives the snapshot's answer, the one off
 * reads, so the card is never checked against less than off. Only the stored list is faked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { firestoreForgetStore } from '../../../../memory/recall/forget.js';
import {
  readTopics,
  resetForgetTopicsSource,
} from '../../../../memory/recall/forget-topics-source.js';
import { CARD_BUDGET_MS } from '../load.js';
import { callerCardPorts } from '../wiring.js';

const U = 'member-caller-card-fresh';
const forgotten = async () => callerCardPorts({ userId: U, userProfile: null }).forgotten(U);

function stored(topics: string[] | null): void {
  vi.spyOn(firestoreForgetStore, 'topics').mockImplementation(async () => topics);
}

describe('caller card forget read, FORGET_FRESH_READ (#2755)', () => {
  beforeEach(async () => {
    resetForgetTopicsSource();
    vi.stubEnv('FORGET_EVERY_READER', 'on');
    stored([]);
    expect(await readTopics(U)).toEqual([]); // another reader warmed the shared cache
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('on: a forget another process stored counts, inside the 15 s cache', async () => {
    vi.stubEnv('FORGET_FRESH_READ', 'on');
    stored(['Maplewood']); // written elsewhere: nothing in this process clears the cache
    expect(await forgotten()).toEqual(['Maplewood']);
  });

  it('on: an unreadable store gives what off reads (the cached list), not null', async () => {
    vi.stubEnv('FORGET_FRESH_READ', 'on');
    resetForgetTopicsSource();
    stored(['Biscuit']);
    await readTopics(U); // the last list this process read
    stored(null);
    expect(await forgotten()).toEqual(['Biscuit']); // not null: Home is still checked
  });

  it('on: a store answering in 350-400 ms with a cold cache still checks Home, inside the budget', async () => {
    vi.stubEnv('FORGET_FRESH_READ', 'on');
    resetForgetTopicsSource(); // cold: nothing cached in this process
    vi.spyOn(firestoreForgetStore, 'topics').mockImplementation(
      async () =>
        new Promise<string[]>((resolve) => {
          setTimeout(() => resolve(['Maplewood']), 370);
        })
    );
    const started = Date.now();
    expect(await forgotten()).toEqual(['Maplewood']); // off's read, which waits out its budget
    expect(Date.now() - started).toBeLessThan(CARD_BUDGET_MS);
  });

  it('off: the shared cached list, as before', async () => {
    stored(['Maplewood']);
    expect(await forgotten()).toEqual([]);
  });
});
