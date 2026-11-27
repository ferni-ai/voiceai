/**
 * The forgotten-topics source the readers outside recall share
 * (forget-topics-source.ts) and the match they use (aboutForgotten): one
 * in-flight read, failed reads held back, a reader that can't wait falls back
 * to the last topics read and fails closed only with no source; the
 * transcript-tick check answers as the waiting one does; a name in a topic
 * must appear whole.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const read = vi.hoisted(() => ({ fn: vi.fn(async (_u: string): Promise<string[] | null> => []) }));
const logged = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock('../../../utils/safe-logger.js', async (original) => {
  const real = await original<typeof import('../../../utils/safe-logger.js')>();
  return {
    ...real,
    createLogger: (...a: Parameters<typeof real.createLogger>) => {
      const l = real.createLogger(...a);
      return Object.assign(Object.create(l), { warn: logged.warn });
    },
  };
});
vi.mock('../forget.js', async (original) => ({
  ...(await original<typeof import('../forget.js')>()),
  forgottenTopicsOrNull: (userId: string) => read.fn(userId),
}));

import {
  BACKOFF_MIN_MS,
  forgetReadStats,
  READ_TIMEOUT_MS,
  readTopics,
  resetForgetTopicsSource,
  topicsWithin,
} from '../forget-topics-source.js';
import {
  aboutForgotten,
  forgottenCheck,
  forgottenCheckNow,
  forgottenPassageWithin,
  forgottenWithin,
  profileForPrompt,
  snapshotTopics,
} from '../forget-every-reader.js';
import { forgetTopic, type ForgetStore } from '../forget.js';

const U = 'member-topics-source';

beforeEach(() => {
  resetForgetTopicsSource();
  read.fn.mockReset();
  vi.stubEnv('FORGET_EVERY_READER', 'on');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('one shared read', () => {
  it('readers at the same moment share one Firestore read, then the cache', async () => {
    read.fn.mockResolvedValue(['Biscuit']);
    const [a, b, c] = await Promise.all([readTopics(U), readTopics(U), snapshotTopics(U)]);
    expect([a, b, c]).toEqual([['Biscuit'], ['Biscuit'], ['Biscuit']]);
    await forgottenCheck(U);
    expect(read.fn).toHaveBeenCalledTimes(1);
  });

  it('the recall snapshot store shares that read too', async () => {
    read.fn.mockResolvedValue(['Biscuit']);
    const { firestoreRecallStore } =
      await import('../../../agents/multi-agent/recall-firestore-store.js');
    const [snap, mine] = await Promise.all([firestoreRecallStore.forgotten!(U), readTopics(U)]);
    expect([snap, mine]).toEqual([['Biscuit'], ['Biscuit']]);
    expect(read.fn).toHaveBeenCalledTimes(1);
  });

  it('holds a failed read back for the backoff; the snapshot may force one', async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    read.fn.mockResolvedValue(null);
    expect(await readTopics(U)).toBeNull();
    for (let i = 0; i < 20; i++) forgottenCheckNow(U); // twenty interim transcripts
    expect(read.fn).toHaveBeenCalledTimes(1);
    expect(await snapshotTopics(U)).toBeNull(); // forced past the backoff
    expect(read.fn).toHaveBeenCalledTimes(2);
    vi.setSystemTime(1_000_000 + 2 * BACKOFF_MIN_MS + 1); // the backoff doubled to 2 s
    read.fn.mockResolvedValue(['Biscuit']);
    expect(await readTopics(U)).toEqual(['Biscuit']);
    expect(read.fn).toHaveBeenCalledTimes(3);
  });
});

describe('a reader that cannot wait', () => {
  it('falls back to the last topics read on a timeout, and counts it', async () => {
    vi.useFakeTimers({ now: 2_000_000 });
    read.fn.mockResolvedValueOnce(['Biscuit']);
    await readTopics(U);
    vi.setSystemTime(2_000_000 + 60_000); // the cached read is stale now
    read.fn.mockImplementationOnce(() => new Promise<never>(() => {})); // never answers
    const got = topicsWithin(U, 'test');
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS + 1);
    expect(await got).toEqual(['Biscuit']);
    expect(forgetReadStats()).toMatchObject({ timeouts: 1, fallbacks: 1, failClosed: 0 });
  });

  it('fails closed only with no source at all', async () => {
    read.fn.mockResolvedValue(null);
    const check = await forgottenCheck(U);
    expect(check?.('anything at all')).toBe(true);
    expect(forgetReadStats().failClosed).toBe(1);
  });

  it('the transcript-tick check answers as the waiting check does', async () => {
    read.fn.mockResolvedValue(null);
    expect(forgottenCheckNow(U)?.('anything')).toBe(true); // nothing read yet: closed, same as above
    await readTopics(U); // that read settles (failed)
    read.fn.mockResolvedValue(['Biscuit']);
    await snapshotTopics(U);
    const now = forgottenCheckNow(U)!;
    const waited = (await forgottenCheck(U))!;
    for (const text of ['Biscuit chewed it', 'training for Boston']) {
      expect(now(text)).toBe(waited(text));
    }
    expect(now('Biscuit chewed it')).toBe(true);
    expect(now('training for Boston')).toBe(false);
  });
});

describe('aboutForgotten: names match whole words', () => {
  it('forgetting Mark does not hide "marked"', () => {
    expect(aboutForgotten('the report was marked late', ['Mark'])).toBe(false);
    expect(aboutForgotten('Mark called about dinner', ['Mark'])).toBe(true);
    expect(aboutForgotten("Mark's birthday is Friday", ['Mark'])).toBe(true);
  });

  it('a name with an "s" or inside a hyphenated word still counts, "marked" still does not', () => {
    // #2719 verifier: these showed with the name forgotten.
    expect(aboutForgotten('Marks birthday party is Saturday', ['Mark'])).toBe(true);
    expect(aboutForgotten('Danas lawyer called back', ['Dana'])).toBe(true);
    expect(aboutForgotten('dinner with mark-and-jen', ['Mark'])).toBe(true);
    expect(aboutForgotten('marked the calendar for Friday', ['Mark'])).toBe(false);
  });

  it('a topic that is not a name still matches other forms', () => {
    expect(aboutForgotten('the weddings this summer', ['sister wedding'])).toBe(false);
    expect(aboutForgotten("my sister's weddings", ['sister wedding'])).toBe(true);
    expect(aboutForgotten('divorcing was hard', ['divorce'])).toBe(true);
  });
});

describe('forgottenWithin: bounded, and unflagged', () => {
  it('works with the flag off; a hung read fails closed even with a last-known list', async () => {
    // #2727: the last-known list has no age bound yet (#2623), so a late read must not use it.
    vi.stubEnv('FORGET_EVERY_READER', 'off');
    vi.useFakeTimers({ now: 3_000_000 });
    read.fn.mockResolvedValueOnce(['Biscuit']);
    expect((await forgottenWithin(U))?.('Biscuit chewed it')).toBe(true);
    vi.setSystemTime(3_000_000 + 60_000); // stale
    read.fn.mockImplementationOnce(() => new Promise<never>(() => {})); // never answers
    const got = forgottenWithin(U);
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS + 1);
    expect(await got).toBeNull();
    expect(forgetReadStats()).toMatchObject({ timeouts: 1, fallbacks: 0, failClosed: 1 });
  });

  it('a hung read with nothing known fails closed (null)', async () => {
    vi.useFakeTimers();
    read.fn.mockImplementation(() => new Promise<never>(() => {}));
    const got = forgottenWithin(U);
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS + 1);
    expect(await got).toBeNull();
    expect(forgetReadStats()).toMatchObject({ timeouts: 1, failClosed: 1 });
  });

  it('each fail-closed answer is logged with its reader and why, so its rate can be measured', async () => {
    vi.useFakeTimers();
    logged.warn.mockClear();
    read.fn.mockImplementationOnce(() => new Promise<never>(() => {})); // hangs
    const late = forgottenWithin(U, 'last-summary');
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS + 1);
    expect(await late).toBeNull();
    resetForgetTopicsSource();
    read.fn.mockResolvedValueOnce(null); // unreadable
    expect(await forgottenWithin(U, 'recent-context')).toBeNull();
    const closed = logged.warn.mock.calls
      .filter(([, msg]) => msg === 'Forgotten topics: no fresh read, failing closed')
      .map(([d]) => ({ reader: d.reader, why: d.why }));
    expect(closed).toEqual([
      { reader: 'last-summary', why: 'timeout' },
      { reader: 'recent-context', why: 'failed' },
    ]);
  });
});

describe('forgottenPassageWithin: the passage match, fresh reads only', () => {
  it('any distinctive word of a topic counts, as the passage readers read', async () => {
    read.fn.mockResolvedValue(['the Denver job']);
    const check = await forgottenPassageWithin(U);
    expect(check?.('the offer from the Denver office')).toBe(true);
    expect(check?.('a weekend in Boston')).toBe(false);
    // The fact readers' match needs more of the topic, so it keeps this passage.
    expect((await forgottenCheck(U))?.('the offer from the Denver office')).toBe(false);
  });

  it('a failed read after a good one fails closed, never the old list (#2623)', async () => {
    vi.useFakeTimers({ now: 4_000_000 });
    read.fn.mockResolvedValueOnce([]); // read before: nothing forgotten yet
    expect((await forgottenPassageWithin(U))?.('the Denver job')).toBe(false);
    vi.setSystemTime(4_000_000 + 60_000); // stale
    read.fn.mockResolvedValueOnce(null); // forgotten elsewhere since; this read fails
    expect(await forgottenPassageWithin(U)).toBeNull();
    expect(forgetReadStats()).toMatchObject({ fallbacks: 0, failClosed: 1 });
  });

  it('a check held for a call counts a topic forgotten in this process after it was made', async () => {
    const user = 'member-held-check'; // its own: this process's forgets outlive the test
    read.fn.mockResolvedValue([]);
    const check = await forgottenPassageWithin(user);
    expect(check?.('plant the tomatoes this weekend')).toBe(false);
    const store: ForgetStore = {
      facts: async () => [],
      markForgotten: async () => undefined,
      addTopic: async () => 1,
      topics: async () => [],
    };
    await forgetTopic(user, 'the tomatoes', store, new Date(), {});
    expect(check?.('plant the tomatoes this weekend')).toBe(true);
  });

  it('uncached reads the store past a fresh cached list (#2755)', async () => {
    read.fn.mockResolvedValueOnce([]);
    expect((await forgottenPassageWithin(U))?.('the Denver job')).toBe(false); // cached, fresh
    read.fn.mockResolvedValueOnce(['the Denver job']); // forgotten in another process
    expect((await forgottenPassageWithin(U))?.('the Denver job')).toBe(false);
    read.fn.mockResolvedValueOnce(['the Denver job']);
    expect((await forgottenPassageWithin(U, 'r', process.env, true))?.('the Denver job')).toBe(
      true
    );
  });

  it('null with the flag off or no member, and nothing is read', async () => {
    vi.stubEnv('FORGET_EVERY_READER', 'off');
    expect(await forgottenPassageWithin(U)).toBeNull();
    vi.stubEnv('FORGET_EVERY_READER', 'on');
    expect(await forgottenPassageWithin(undefined)).toBeNull();
    expect(read.fn).not.toHaveBeenCalled();
  });
});

describe('FORGET_FRESH_READ: the call-start profile reads the store (#2755)', () => {
  type Events = { lifeEvents: Array<{ id: string; title: string }> };
  const profile = (): Events => ({
    lifeEvents: [
      { id: 'l1', title: 'Biscuit is sick' },
      { id: 'l2', title: 'moving to Denver' },
    ],
  });
  const titles = (p: Events | null) => (p?.lifeEvents ?? []).map((e) => e.title);
  const atCallStart = async () =>
    titles(await profileForPrompt({ userId: U, userProfile: profile() }));

  it('on: a forget another process stored is scrubbed, inside the 15 s cache', async () => {
    vi.stubEnv('FORGET_FRESH_READ', 'on');
    read.fn.mockResolvedValue([]);
    expect(await readTopics(U)).toEqual([]); // another reader warmed the shared cache
    read.fn.mockResolvedValue(['Biscuit']); // written by another pod or the web app
    expect(await atCallStart()).toEqual(['moving to Denver']);
  });

  it('off: the shared cached list, as before', async () => {
    read.fn.mockResolvedValue([]);
    await readTopics(U);
    read.fn.mockResolvedValue(['Biscuit']);
    expect(await atCallStart()).toEqual(['Biscuit is sick', 'moving to Denver']);
    expect(read.fn).toHaveBeenCalledTimes(1);
  });

  it('on: a late store read falls back to the last topics read, never to none', async () => {
    vi.stubEnv('FORGET_FRESH_READ', 'on');
    vi.useFakeTimers({ now: 6_000_000 });
    read.fn.mockResolvedValueOnce(['Biscuit']);
    await readTopics(U);
    read.fn.mockImplementationOnce(() => new Promise<never>(() => {})); // never answers
    const seen = atCallStart();
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS + 1);
    expect(await seen).toEqual(['moving to Denver']);
    expect(forgetReadStats()).toMatchObject({ timeouts: 1, fallbacks: 1, failClosed: 0 });
  });
});
