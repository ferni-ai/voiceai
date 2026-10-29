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
  forgottenWithin,
  snapshotTopics,
} from '../forget-every-reader.js';

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
