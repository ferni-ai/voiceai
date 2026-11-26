/**
 * The caller card's forget read (callerCardPorts().forgotten) with FORGET_FRESH_READ: from the
 * store itself, so a forget another process stored just before this persona's setup counts inside
 * the shared 15 s cache (#2755); a late or failed read falls back to the last known topics, never
 * worse than off. Off, the recall snapshot's cached read as before. Only the stored list is faked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { firestoreForgetStore } from '../../../../memory/recall/forget.js';
import {
  readTopics,
  resetForgetTopicsSource,
} from '../../../../memory/recall/forget-topics-source.js';
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

  it('on: an unreadable store falls back to the last known topics, as off would', async () => {
    vi.stubEnv('FORGET_FRESH_READ', 'on');
    resetForgetTopicsSource();
    stored(['Biscuit']);
    await readTopics(U); // the last list this process read
    stored(null);
    expect(await forgotten()).toEqual(['Biscuit']); // not null: Home is still checked
  });

  it('off: the shared cached list, as before', async () => {
    stored(['Maplewood']);
    expect(await forgotten()).toEqual([]);
  });
});
