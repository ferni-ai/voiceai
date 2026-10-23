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
vi.mock('../../../utils/firestore-utils.js', async (original) => ({
  ...(await original<typeof import('../../../utils/firestore-utils.js')>()),
  getFirestoreDb: () => {
    const rows: Record<string, object[]> = {
      // A fact names an entity of any kind; only people and pets are names.
      dynamic_facts: [
        { entityName: 'Mark', key: 'relation', value: 'brother' },
        { entityName: 'Divorce', key: 'status', value: 'final in March' },
      ],
      dynamic_entities: [
        { name: 'Mark', type: 'person' },
        { name: 'Biscuit', type: 'pet' },
        { name: 'Divorce', type: 'event' },
      ],
    };
    const query = (name: string) => {
      const docs = (rows[name] ?? []).map((r) => ({ data: () => r }));
      const q = { orderBy: () => q, limit: () => q, where: () => q, get: async () => ({ docs }) };
      return q;
    };
    return { collection: () => ({ doc: () => ({ collection: query }) }) };
  },
}));
vi.mock('../forget.js', async (original) => ({
  ...(await original<typeof import('../forget.js')>()),
  forgottenTopicsOrNull: (userId: string) => read.fn(userId),
}));

import {
  BACKOFF_MIN_MS,
  CALL_MARK_MAX_MS,
  READ_HANG_MS,
  forgetReadStats,
  READ_TIMEOUT_MS,
  readTopics,
  resetForgetTopicsSource,
  topicsWithin,
  knownNames,
} from '../forget-topics-source.js';
import {
  aboutForgotten,
  forgottenCheck,
  forgottenCheckNow,
  prefetchForgotten,
  rememberCallerNames,
  snapshotTopics,
} from '../forget-every-reader.js';
import { storedTopic } from '../session-recall.js';

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
    vi.setSystemTime(2_000_000 + 20_000); // the cached read is stale, still recent
    read.fn.mockImplementationOnce(() => new Promise<never>(() => {})); // never answers
    const got = topicsWithin(U, 'test');
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS + 1);
    expect(await got).toEqual(['Biscuit']);
    expect(forgetReadStats()).toMatchObject({ timeouts: 1, fallbacks: 1, failClosed: 0 });
  });

  it('does not trust last-known topics days old: the read fails, so it fails closed', async () => {
    vi.useFakeTimers({ now: 3_000_000 });
    read.fn.mockResolvedValueOnce([]); // read three days ago: nothing forgotten yet
    await readTopics(U);
    vi.setSystemTime(3_000_000 + 3 * 24 * 3600_000); // "divorce" forgotten since, elsewhere
    read.fn.mockResolvedValue(null); // and the read now fails
    const check = await forgottenCheck(U);
    expect(check?.('the divorce papers')).toBe(true); // fail closed: nothing reaches the prompt
    expect(forgetReadStats()).toMatchObject({ fallbacks: 0, failClosed: 1 });
  });

  it('stops trusting the call mark after CALL_MARK_MAX_MS: an old call is not this call', async () => {
    vi.useFakeTimers({ now: 5_000_000 });
    read.fn.mockResolvedValueOnce(['Biscuit']);
    prefetchForgotten(U); // a call starts and reads the topics
    await readTopics(U);
    vi.setSystemTime(5_000_000 + CALL_MARK_MAX_MS + 1); // that call is long over
    read.fn.mockResolvedValue(null);
    const check = await forgottenCheck(U);
    expect(check?.('training for Boston')).toBe(true); // no source: fail closed
    expect(forgetReadStats()).toMatchObject({ fallbacks: 0, failClosed: 1 });
  });

  it("ends the call mark at the persona's teardown: after the call, it fails closed", async () => {
    vi.useFakeTimers({ now: 6_000_000 });
    read.fn.mockResolvedValueOnce(['Biscuit']);
    const teardown: Array<() => void> = [];
    prefetchForgotten(U, (fn) => teardown.push(fn)); // agent setup hands its teardown
    await readTopics(U);
    vi.setSystemTime(6_000_000 + 5 * 60_000); // past the 60 s bound, still in the call
    read.fn.mockResolvedValue(null);
    expect((await forgottenCheck(U))?.('training for Boston')).toBe(false); // this call's read
    for (const fn of teardown) fn(); // the call ends
    expect((await forgottenCheck(U))?.('training for Boston')).toBe(true); // no source: closed
  });

  it("an older call's teardown leaves a newer call's mark alone", async () => {
    vi.useFakeTimers({ now: 7_000_000 });
    read.fn.mockResolvedValueOnce(['Biscuit']);
    const older: Array<() => void> = [];
    prefetchForgotten(U, (fn) => older.push(fn)); // a call starts
    vi.setSystemTime(7_000_000 + 60_000);
    prefetchForgotten(U, () => undefined); // the next call starts before the first tears down
    await readTopics(U);
    for (const fn of older) fn(); // the first call's teardown runs late
    vi.setSystemTime(7_000_000 + 10 * 60_000); // past the 60 s bound, the newer call still on
    read.fn.mockResolvedValue(null);
    expect((await forgottenCheck(U))?.('training for Boston')).toBe(false); // newer mark held
  });

  it('a read that hangs is given up on: that tick fails closed, a later one reads again', async () => {
    vi.useFakeTimers({ now: 8_000_000 });
    read.fn.mockImplementationOnce(() => new Promise(() => undefined)); // never settles
    const first = forgottenCheck(U);
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS);
    expect((await first)?.('training for Boston')).toBe(true); // nothing read: closed
    await vi.advanceTimersByTimeAsync(READ_HANG_MS + BACKOFF_MIN_MS); // the hung read is dropped
    read.fn.mockResolvedValueOnce(['Biscuit']);
    const later = await forgottenCheck(U);
    expect(later?.('training for Boston')).toBe(false); // read again, and it answers
    expect(later?.('Biscuit chewed it')).toBe(true);
  });

  it('trusts last-known topics read during this call, however long ago', async () => {
    vi.useFakeTimers({ now: 4_000_000 });
    read.fn.mockResolvedValueOnce(['Biscuit']);
    prefetchForgotten(U); // agent setup: the call starts, the read runs
    await readTopics(U); // joins it
    vi.setSystemTime(4_000_000 + 20 * 60_000); // twenty minutes into the call
    read.fn.mockResolvedValue(null);
    const check = await forgottenCheck(U);
    expect(check?.('Biscuit chewed it')).toBe(true);
    expect(check?.('training for Boston')).toBe(false);
    expect(forgetReadStats()).toMatchObject({ fallbacks: 1, failClosed: 0 });
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

describe('aboutForgotten: known names whole, everything else stems', () => {
  const known = new Set(['mark', 'biscuit']);

  it('forgetting Mark (a known name) does not hide "marked"', () => {
    expect(aboutForgotten('the report was marked late', ['Mark'], known)).toBe(false);
    expect(aboutForgotten('Mark called about dinner', ['Mark'], known)).toBe(true);
    expect(aboutForgotten("Mark's birthday is Friday", ['Mark'], known)).toBe(true);
  });

  it('a known name still matches its plural: "Biscuit" catches "the Biscuits"', () => {
    expect(aboutForgotten('we walked the Biscuits today', ['Biscuit'], known)).toBe(true);
  });

  it('title case that is not a name stems: "Divorce Papers" catches "divorce paper arrived"', () => {
    expect(aboutForgotten('the divorce paper arrived', ['Divorce Papers'], known)).toBe(true);
  });

  it('a one-word capitalized common noun matches its inflections', () => {
    expect(aboutForgotten('they divorced last spring', ['Divorce'], known)).toBe(true);
    expect(aboutForgotten('still divorcing, slowly', ['Divorce'], known)).toBe(true);
  });

  it('with no known names every word stems, erring toward leaving it out', () => {
    expect(aboutForgotten('the report was marked late', ['Mark'])).toBe(true);
  });

  it("recall's facts load teaches the names of people and pets, never an event", async () => {
    const { firestoreRecallStore } =
      await import('../../../agents/multi-agent/recall-firestore-store.js');
    await firestoreRecallStore.facts('member-facts-names');
    const names = knownNames('member-facts-names');
    expect([...names].sort()).toEqual(['biscuit', 'mark']);
  });

  it('an event is not a name: forgetting Divorce still hides "divorced"', async () => {
    const { firestoreRecallStore } =
      await import('../../../agents/multi-agent/recall-firestore-store.js');
    await firestoreRecallStore.facts(U);
    expect(aboutForgotten('they divorced last spring', ['Divorce'], knownNames(U))).toBe(true);
    expect(aboutForgotten('the report was marked late', ['Mark'], knownNames(U))).toBe(false);
  });

  it('flag off: no names are learned', () => {
    vi.stubEnv('FORGET_EVERY_READER', 'off');
    rememberCallerNames(U, ['Mark']);
    expect(knownNames(U).size).toBe(0);
  });

  it('a topic in a non-Latin script is stored and applies', () => {
    expect(storedTopic('развод')).toBe('развод');
    expect(aboutForgotten('документы на развод пришли', ['развод'])).toBe(true);
    expect(aboutForgotten('сегодня хорошая погода', ['развод'])).toBe(false);
    expect(aboutForgotten('Η Μαρία τηλεφώνησε', ['Μαρία'])).toBe(true);
  });

  it('a topic that is not a name still matches other forms', () => {
    expect(aboutForgotten('the weddings this summer', ['sister wedding'])).toBe(false);
    expect(aboutForgotten("my sister's weddings", ['sister wedding'])).toBe(true);
    expect(aboutForgotten('divorcing was hard', ['divorce'])).toBe(true);
  });
});
