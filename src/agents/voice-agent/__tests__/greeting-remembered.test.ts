/**
 * The single-agent greeting's reads of what the caller asked Ferni to forget. With
 * FORGET_FRESH_READ the profile and the stated intentions read the store itself (#2755), so a
 * forget stored by another pod or the web app just before the call counts inside the shared 15 s
 * cache; an unreadable store leaves the intentions out. Off, the cached read as before. Only the
 * stored list is faked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { firestoreForgetStore } from '../../../memory/recall/forget.js';
import {
  readTopics,
  resetForgetTopicsSource,
} from '../../../memory/recall/forget-topics-source.js';
import type { SessionServices } from '../../../services/index.js';
import {
  forgetSmallWinsUser,
  importSmallWinsProfile,
} from '../../../services/trust-systems/small-wins.js';
import { greetingRemembered } from '../greeting-remembered.js';

const U = 'member-greeting-remembered';
const DENVER = 'apply for the Denver job';
const GARDEN = 'plant the tomatoes this weekend';

function stored(topics: string[] | null): void {
  vi.spyOn(firestoreForgetStore, 'topics').mockImplementation(async () => topics);
}

function intending(...said: string[]): void {
  importSmallWinsProfile({
    userId: U,
    wins: [],
    pendingIntentions: said.map((intention, i) => ({
      id: `i${i}`,
      intention,
      statedAt: new Date('2026-11-20T12:00:00Z'),
      completionKeywords: [],
      status: 'pending',
    })),
    knownDifficulties: [],
    celebrationPreference: 'understated',
  });
}

const intentions = async () =>
  (
    await greetingRemembered({ userId: U, userProfile: null } as unknown as SessionServices)
  ).pendingIntentions.map((i) => i.intention);

describe('greeting reads, FORGET_FRESH_READ (#2755)', () => {
  beforeEach(() => {
    resetForgetTopicsSource();
    vi.stubEnv('FORGET_EVERY_READER', 'on');
    intending(DENVER, GARDEN);
  });
  afterEach(() => {
    forgetSmallWinsUser(U);
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('on: a forget another process stored leaves the intention out, inside the 15 s cache', async () => {
    vi.stubEnv('FORGET_FRESH_READ', 'on');
    stored([]);
    expect(await readTopics(U)).toEqual([]); // another reader warmed the shared cache
    stored(['the Denver job']); // written elsewhere: nothing in this process clears the cache
    expect(await intentions()).toEqual([GARDEN]);
  });

  it('on: an unreadable store leaves every intention out, even with a good list cached', async () => {
    vi.stubEnv('FORGET_FRESH_READ', 'on');
    stored([]);
    await readTopics(U);
    stored(null);
    expect(await intentions()).toEqual([]);
  });

  it('off: the shared cached list, as before', async () => {
    stored([]);
    await readTopics(U);
    stored(['the Denver job']);
    expect(await intentions()).toEqual([DENVER, GARDEN]);
  });

  it('on, FORGET_EVERY_READER off: every intention, and nothing is read', async () => {
    vi.stubEnv('FORGET_FRESH_READ', 'on');
    vi.stubEnv('FORGET_EVERY_READER', 'off');
    stored(['the Denver job']);
    expect(await intentions()).toEqual([DENVER, GARDEN]);
    expect(firestoreForgetStore.topics).not.toHaveBeenCalled();
  });

  it('on: the greeting profile is scrubbed of a forget another process stored', async () => {
    vi.stubEnv('FORGET_FRESH_READ', 'on');
    stored([]);
    await readTopics(U);
    stored(['Biscuit']);
    const userProfile = {
      lifeEvents: [
        { id: 'l1', title: 'Biscuit is sick' },
        { id: 'l2', title: 'moving to Denver' },
      ],
    };
    const services = { userId: U, userProfile } as unknown as SessionServices;
    const seen = (await greetingRemembered(services)).profile as unknown as
      typeof userProfile | null;
    expect(seen?.lifeEvents.map((e) => e.title)).toEqual(['moving to Denver']);
  });

  it('on: the profile and intentions reads go out together, neither waits on the other', async () => {
    vi.stubEnv('FORGET_FRESH_READ', 'on');
    const release: Array<(topics: string[]) => void> = [];
    vi.spyOn(firestoreForgetStore, 'topics').mockImplementation(
      async () =>
        new Promise<string[]>((resolve) => {
          release.push(resolve);
        })
    );
    const userProfile = { lifeEvents: [{ id: 'l1', title: 'Biscuit is sick' }] };
    const services = { userId: U, userProfile } as unknown as SessionServices;
    const pending = greetingRemembered(services);
    // Well inside the 300 ms bound: one after the other, the second read would not have started.
    await vi.waitFor(() => expect(release).toHaveLength(2), { timeout: 150 });
    for (const r of release) r(['Denver']);
    expect((await pending).pendingIntentions.map((i) => i.intention)).toEqual([GARDEN]);
  });
});
