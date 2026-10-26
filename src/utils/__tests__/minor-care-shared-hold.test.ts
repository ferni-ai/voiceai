/**
 * MINOR_CARE_SHARED_HOLD: the hold seen outside the voice process.
 * - minor-care.ts tells its listener once when a session becomes held for its bound user: never
 *   for a placeholder id, a verified owner (unless MINOR_CARE_OWNERS) or with MINOR_CARE off.
 * - recordSharedHold writes only { heldUntil, v } (no words, no age).
 * - sharedHeld reads it: held until heldUntil, off with either flag off, not held on a read error.
 * Only the hold store is faked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The Firestore documents firestoreHoldStore writes, by path. */
const firestoreDocs = vi.hoisted(() => new Map<string, Record<string, unknown>>());
vi.mock('../firestore-utils.js', async (orig) => ({
  ...(await orig<object>()),
  getFirestoreDb: () => ({
    collection: (c: string) => ({
      doc: (id: string) => ({
        path: `${c}/${id}`,
        set: async (data: Record<string, unknown>) => void firestoreDocs.set(`${c}/${id}`, data),
      }),
    }),
    runTransaction: async (fn: (tx: unknown) => Promise<void>) =>
      fn({
        get: async (ref: { path: string }) => ({ data: () => firestoreDocs.get(ref.path) }),
        set: (ref: { path: string }, data: Record<string, unknown>, opts?: { merge?: boolean }) =>
          void firestoreDocs.set(ref.path, {
            ...(opts?.merge ? firestoreDocs.get(ref.path) : {}),
            ...data,
          }),
      }),
  }),
}));
import {
  IDLE_MS,
  bindSessionUser,
  memoryHeld,
  noteCallerWords,
  resetMinorCare,
  setOnUserHeld,
  setVerifiedOwnerCheck,
} from '../minor-care.js';
import {
  CACHE_MS,
  firestoreHoldStore,
  recordSharedHold,
  setHoldStore,
  sharedHeld,
  type HoldStore,
} from '../../services/outreach/minor-care-shared-hold.js';

const UNDER_18 = "I'm 15 years old";
const ON = { MINOR_CARE: 'on', MINOR_CARE_SHARED_HOLD: 'on' };
const NOW = 1_800_000_000_000;

function fakeStore(until: Record<string, number> = {}, opts: { failReads?: boolean } = {}) {
  const writes: Array<[string, unknown]> = [];
  const store: HoldStore = {
    heldUntil: vi.fn(async (userId: string) => {
      if (opts.failReads) throw new Error('unavailable');
      return until[userId];
    }),
    write: vi.fn(async (userId: string, record: unknown) => void writes.push([userId, record])),
  };
  return { store, writes };
}

beforeEach(() => {
  resetMinorCare();
  setHoldStore();
});
afterEach(() => {
  vi.unstubAllEnvs();
  setOnUserHeld(() => {});
});

describe('the hold listener (minor-care.ts)', () => {
  const heard = vi.fn();
  beforeEach(() => {
    heard.mockReset();
    setOnUserHeld(heard);
    vi.stubEnv('MINOR_CARE', 'on');
  });

  it('fires once when a bound session becomes held, never again for later turns', () => {
    bindSessionUser('s1', 'u1');
    expect(heard).not.toHaveBeenCalled();
    expect(noteCallerWords('s1', UNDER_18)).toBe(true);
    expect(memoryHeld('s1')).toBe(true);
    noteCallerWords('s1', 'and I like soccer');
    bindSessionUser('s1', 'u1');
    expect(heard.mock.calls).toEqual([['u1', 's1']]);
  });

  it('fires again for each new id a held session is bound to (anon: -> account mid-call)', () => {
    bindSessionUser('s1', 'anon:abc');
    noteCallerWords('s1', UNDER_18);
    bindSessionUser('s1', 'u1');
    bindSessionUser('s1', 'u1');
    expect(heard.mock.calls).toEqual([
      ['anon:abc', 's1'],
      ['u1', 's1'],
    ]);
  });

  it('fires when a held session is bound to its user afterwards', () => {
    noteCallerWords('s1', UNDER_18);
    expect(heard).not.toHaveBeenCalled(); // no user yet
    bindSessionUser('s1', 'u1');
    expect(heard.mock.calls).toEqual([['u1', 's1']]);
  });

  it('never for a placeholder or shared id', () => {
    for (const id of ['anonymous', 'default', 'unknown', ' ']) bindSessionUser(`s-${id}`, id);
    for (const id of ['anonymous', 'default', 'unknown', ' ']) noteCallerWords(`s-${id}`, UNDER_18);
    expect(heard).not.toHaveBeenCalled();
  });

  it("never for a caller who didn't sound under 18", () => {
    bindSessionUser('s1', 'u1');
    noteCallerWords('s1', 'my son is 16');
    expect(heard).not.toHaveBeenCalled();
  });

  it('never for a verified owner, unless MINOR_CARE_OWNERS holds them too', () => {
    setVerifiedOwnerCheck((s) => s === 'owner');
    bindSessionUser('owner', 'u1');
    noteCallerWords('owner', UNDER_18);
    expect(memoryHeld('owner')).toBe(false);
    expect(heard).not.toHaveBeenCalled();

    resetMinorCare();
    setVerifiedOwnerCheck((s) => s === 'owner');
    vi.stubEnv('MINOR_CARE_OWNERS', 'on');
    bindSessionUser('owner', 'u1');
    noteCallerWords('owner', UNDER_18);
    expect(memoryHeld('owner')).toBe(true);
    expect(heard.mock.calls).toEqual([['u1', 'owner']]);
  });

  it('never with MINOR_CARE off', () => {
    vi.stubEnv('MINOR_CARE', 'off');
    bindSessionUser('s1', 'u1');
    noteCallerWords('s1', UNDER_18);
    expect(memoryHeld('s1')).toBe(false);
    expect(heard).not.toHaveBeenCalled();
  });

  it('a listener that throws never reaches the call path', () => {
    setOnUserHeld(() => {
      throw new Error('boom');
    });
    bindSessionUser('s1', 'u1');
    expect(() => noteCallerWords('s1', UNDER_18)).not.toThrow();
    expect(memoryHeld('s1')).toBe(true);
  });
});

describe('recordSharedHold', () => {
  it('writes only { heldUntil: now + the idle window, v: 1 }', async () => {
    const { store, writes } = fakeStore();
    setHoldStore(store);
    await recordSharedHold('u1', ON, NOW);
    expect(writes).toEqual([['u1', { heldUntil: NOW + IDLE_MS, v: 1 }]]);
    expect(Object.keys(writes[0]![1] as object).sort()).toEqual(['heldUntil', 'v']);
  });

  it.each([
    ['MINOR_CARE_SHARED_HOLD off', { MINOR_CARE: 'on' }],
    ['MINOR_CARE off', { MINOR_CARE_SHARED_HOLD: 'on' }],
  ])('writes nothing with %s', async (_name, env) => {
    const { store } = fakeStore();
    setHoldStore(store);
    await recordSharedHold('u1', env, NOW);
    expect(store.write).not.toHaveBeenCalled();
  });

  it('writes nothing for a placeholder, shared or path-like id', async () => {
    const { store } = fakeStore();
    setHoldStore(store);
    for (const id of ['anonymous', 'unknown', '', 'a/b']) await recordSharedHold(id, ON, NOW);
    expect(store.write).not.toHaveBeenCalled();
  });

  it('each write holds until now + the idle window, never added onto an earlier hold', async () => {
    const { store, writes } = fakeStore();
    setHoldStore(store);
    await recordSharedHold('u1', ON, NOW);
    await recordSharedHold('u1', ON, NOW + 3_600_000);
    await recordSharedHold('u1', ON, NOW + 3_600_000);
    expect(writes.map(([, r]) => (r as { heldUntil: number }).heldUntil)).toEqual([
      NOW + IDLE_MS,
      NOW + 3_600_000 + IDLE_MS,
      NOW + 3_600_000 + IDLE_MS,
    ]);
  });

  it('in Firestore: { heldUntil, v } plus expireAt = heldUntil stored as a Timestamp (the TTL field)', async () => {
    firestoreDocs.clear();
    await firestoreHoldStore.write('u1', { heldUntil: NOW + IDLE_MS, v: 1 });
    const doc = firestoreDocs.get('minor_care_holds/u1');
    expect(Object.keys(doc ?? {}).sort()).toEqual(['expireAt', 'heldUntil', 'v']);
    expect(doc?.expireAt).toBeInstanceOf(Date); // the Admin SDK stores a Date as a Timestamp
    expect((doc?.expireAt as Date).getTime()).toBe(NOW + IDLE_MS);
  });

  it('in Firestore: keeps the held windows stored with it, and never expires before them', async () => {
    firestoreDocs.clear();
    const windows = [{ start: NOW - 60_000, end: NOW, scrubbed: false }];
    const keepUntil = NOW + 90 * 24 * 3_600_000;
    firestoreDocs.set('minor_care_holds/u1', { windows, keepUntil, expireAt: new Date(keepUntil) });
    await firestoreHoldStore.write('u1', { heldUntil: NOW + IDLE_MS, v: 1 });
    const doc = firestoreDocs.get('minor_care_holds/u1');
    expect(doc).toMatchObject({ windows, keepUntil, heldUntil: NOW + IDLE_MS, v: 1 });
    expect((doc?.expireAt as Date).getTime()).toBe(keepUntil);
  });

  it('never throws when the write fails', async () => {
    setHoldStore({
      heldUntil: async () => undefined,
      write: async () => {
        throw new Error('unavailable');
      },
    });
    await expect(recordSharedHold('u1', ON, NOW)).resolves.toBeUndefined();
  });
});

describe('sharedHeld', () => {
  it('true while heldUntil is ahead, false once it has passed or with no record', async () => {
    setHoldStore(fakeStore({ held: NOW + 1000, lapsed: NOW - 1 }).store);
    expect(await sharedHeld('held', ON, NOW)).toBe(true);
    expect(await sharedHeld('lapsed', ON, NOW)).toBe(false);
    expect(await sharedHeld('none', ON, NOW)).toBe(false);
  });

  it.each([
    ['MINOR_CARE_SHARED_HOLD off', { MINOR_CARE: 'on' }],
    ['MINOR_CARE off', { MINOR_CARE_SHARED_HOLD: 'on' }],
  ])('false with %s, without reading the record', async (_name, env) => {
    const { store } = fakeStore({ held: NOW + 1000 });
    setHoldStore(store);
    expect(await sharedHeld('held', env, NOW)).toBe(false);
    expect(store.heldUntil).not.toHaveBeenCalled();
  });

  it('a record that cannot be read is not a hold, and is read again next time', async () => {
    const { store } = fakeStore({ held: NOW + 1000 }, { failReads: true });
    setHoldStore(store);
    expect(await sharedHeld('held', ON, NOW)).toBe(false);
    expect(await sharedHeld('held', ON, NOW + 1)).toBe(false);
    expect(store.heldUntil).toHaveBeenCalledTimes(2);
  });

  it('reads a "not held" fresh (another process may write a hold), and reuses a held answer for CACHE_MS', async () => {
    const until: Record<string, number> = {};
    const { store } = fakeStore(until);
    setHoldStore(store);
    expect(await sharedHeld('u1', ON, NOW)).toBe(false);
    until.u1 = NOW + IDLE_MS; // written by another process: seen on the next read, not 30 s later
    expect(await sharedHeld('u1', ON, NOW + 1)).toBe(true);
    expect(await sharedHeld('u1', ON, NOW + CACHE_MS)).toBe(true); // the held answer, reused
    expect(store.heldUntil).toHaveBeenCalledTimes(2);
    expect(await sharedHeld('u1', ON, NOW + CACHE_MS + 1)).toBe(true); // reused no longer: read
    expect(store.heldUntil).toHaveBeenCalledTimes(3);
  });

  it('a hold this process wrote is seen at once', async () => {
    const { store } = fakeStore();
    setHoldStore(store);
    await recordSharedHold('u1', ON, NOW);
    expect(await sharedHeld('u1', ON, NOW + 1)).toBe(true);
    expect(await sharedHeld('u1', ON, NOW + IDLE_MS)).toBe(false);
  });

  it("true for a user held in this process's own sessions, without a read", async () => {
    vi.stubEnv('MINOR_CARE', 'on');
    const { store } = fakeStore();
    setHoldStore(store);
    bindSessionUser('s1', 'u1');
    noteCallerWords('s1', UNDER_18);
    expect(await sharedHeld('u1', ON)).toBe(true);
    expect(store.heldUntil).not.toHaveBeenCalled();
  });

  it('never for a placeholder id', async () => {
    const { store } = fakeStore({ unknown: NOW + 1000 });
    setHoldStore(store);
    expect(await sharedHeld('unknown', ON, NOW)).toBe(false);
    expect(await sharedHeld(undefined, ON, NOW)).toBe(false);
  });
});
