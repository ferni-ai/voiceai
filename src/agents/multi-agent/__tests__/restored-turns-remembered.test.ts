/**
 * Turns replayed into a new call (on reconnect after a drop, or into the phone call a "call me"
 * moved to) leave out what the caller asked Ferni to forget, read from the store itself (#2755):
 * a reconnect comes seconds after the earlier call, while the shared 15 s cache is warm, so a
 * forget stored by another process must still count. Only the stored list is faked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { firestoreForgetStore } from '../../../memory/recall/forget.js';
import {
  readTopics,
  resetForgetTopicsSource,
} from '../../../memory/recall/forget-topics-source.js';
import { rememberedTurns } from '../restored-turns-remembered.js';

const DENVER = { role: 'user', content: 'I got the offer from the Denver office' };
const GARDEN = { role: 'user', content: 'the garden is finally dry' };

function stored(topics: string[] | null): void {
  vi.spyOn(firestoreForgetStore, 'topics').mockImplementation(async () => topics);
}

describe('restored turns, forgotten topics read from the store (#2755)', () => {
  beforeEach(() => {
    resetForgetTopicsSource();
    vi.stubEnv('FORGET_EVERY_READER', 'on');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('nothing forgotten: every turn comes back', async () => {
    stored([]);
    expect(await rememberedTurns('u-kept', [DENVER, GARDEN], 'resume-after-drop')).toEqual([
      DENVER,
      GARDEN,
    ]);
  });

  it('a forget another process stored counts at the reconnect, inside the 15 s cache', async () => {
    stored([]);
    expect(await readTopics('u-elsewhere')).toEqual([]); // the earlier call warmed the cache
    stored(['Denver job offer']); // written elsewhere: nothing in this process clears the cache
    expect(await rememberedTurns('u-elsewhere', [DENVER, GARDEN], 'resume-after-drop')).toEqual([
      GARDEN,
    ]);
  });

  it('an unreadable list restores no turn, even with a good list cached', async () => {
    stored([]);
    await readTopics('u-unread');
    stored(null);
    expect(await rememberedTurns('u-unread', [DENVER, GARDEN], 'call-me-moved')).toEqual([]);
  });
});
