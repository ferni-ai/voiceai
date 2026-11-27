/**
 * The recent texts' forget read with FORGET_FRESH_READ: from the store itself, so a forget another
 * process stored just before the call counts inside the shared 15 s cache (#2755). Off, the cached
 * read as before. Fails closed either way. Only the stored list is faked; fictional caller.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { firestoreForgetStore } from '../../../memory/recall/forget.js';
import {
  readTopics,
  resetForgetTopicsSource,
} from '../../../memory/recall/forget-topics-source.js';
import { firestoreRecentTextsStore } from '../recent-texts.js';

const U = 'member-recent-texts-fresh';
const TEXT = 'Good luck with the Denver interview tomorrow!';

function stored(topics: string[] | null): void {
  vi.spyOn(firestoreForgetStore, 'topics').mockImplementation(async () => topics);
}

async function told(): Promise<boolean | 'unreadable'> {
  const read = await firestoreRecentTextsStore.forgottenFor(U);
  return read.kind === 'unreadable' ? 'unreadable' : !read.isForgotten(TEXT);
}

describe('recent texts forget read, FORGET_FRESH_READ (#2755)', () => {
  beforeEach(async () => {
    resetForgetTopicsSource();
    stored([]);
    expect(await readTopics(U)).toEqual([]); // another reader warmed the shared cache
    vi.mocked(firestoreForgetStore.topics).mockClear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('on: a forget another process stored keeps the text out, inside the 15 s cache', async () => {
    vi.stubEnv('FORGET_FRESH_READ', 'on');
    stored(['Denver']); // written elsewhere: nothing in this process clears the cache
    expect(await told()).toBe(false);
  });

  it('on: an unreadable store tells no text, even with a good list cached', async () => {
    vi.stubEnv('FORGET_FRESH_READ', 'on');
    stored(null);
    expect(await told()).toBe('unreadable');
  });

  it('off: the shared cached list, as before', async () => {
    stored(['Denver']);
    expect(await told()).toBe(true);
    expect(firestoreForgetStore.topics).not.toHaveBeenCalled();
  });
});
