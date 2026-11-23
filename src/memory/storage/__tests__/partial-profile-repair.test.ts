/**
 * A user doc holding only side data reads as the caller's profile (#4293).
 *
 * In prod, `device:` callers had a bogle_users doc whose only key was `temporalPatterns`, so it
 * had no `id`. Every read threw InvalidStoredProfileError, getProfile answered null, and the
 * caller was treated as new on every call. With DEVICE_PROFILE_PARTIAL_REPAIR on, a doc that
 * lacks only its `id` is repaired on read; a genuinely corrupt doc still throws.
 *
 * Firestore is the in-memory merge fake; FirestoreStore is real.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMergeFakeFirestore,
  newMergeFakeState,
  type MergeFakeState,
} from '../../../tests/helpers/merge-fake-firestore.js';

const logged = vi.hoisted(() => [] as unknown[][]);
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  const record =
    (level: string) =>
    (...args: unknown[]) =>
      void logged.push([level, ...args]);
  const logger = {
    debug: record('debug'),
    info: record('info'),
    warn: record('warn'),
    error: record('error'),
    child: () => logger,
  };
  return { ...actual, getLogger: () => logger, createLogger: () => logger };
});

const { FirestoreStore } = await import('../firestore-store.js');
const { resetCallStartReads } = await import('../../../utils/call-start-reads.js');
const { InvalidStoredProfileError } = await import('../profile-read-failure.js');

const UID = 'device:test-0101';
const PATH = `bogle_users/${UID}`;
const temporalPatterns = {
  timeStats: { evening: 3 },
  dayPatterns: { conversationsByDay: { tuesday: 2 } },
  preferredTimes: { mostActive: 'evening', peakEnergy: 'evening', preferenceStrength: 0.3 },
};

let state: MergeFakeState;
let store: InstanceType<typeof FirestoreStore>;

function storeDoc(doc: Record<string, unknown>): void {
  state.docs.set(PATH, structuredClone(doc));
}
const errorLines = () => logged.filter(([level]) => level === 'error').map((l) => l.slice(1));
const invalidLogged = () =>
  logged.some(([level, , msg]) => level === 'error' && msg === 'Invalid user profile data');

beforeEach(() => {
  logged.length = 0;
  resetCallStartReads();
  state = newMergeFakeState();
  store = new FirestoreStore({ projectId: 'test-project' });
  Object.assign(store as unknown as Record<string, unknown>, {
    db: createMergeFakeFirestore(state),
    _initialized: true,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('a stored doc holding only temporalPatterns (the #4293 doc)', () => {
  it('flag on: loads as that caller profile, no InvalidStoredProfileError', async () => {
    vi.stubEnv('DEVICE_PROFILE_PARTIAL_REPAIR', 'on');
    storeDoc({ temporalPatterns });

    const profile = await store.getProfile(UID);

    expect(profile).not.toBeNull();
    expect(profile?.id).toBe(UID);
    expect(profile).toMatchObject({ temporalPatterns, totalConversations: 0 });
    expect(invalidLogged()).toBe(false);
    expect(errorLines()).toEqual([]);
    resetCallStartReads();
    await expect(store.getProfileStrict(UID)).resolves.toMatchObject({ id: UID });
    // A read repairs in memory only: nothing is written.
    expect(state.writes).toEqual([]);
    expect(state.docs.get(PATH)).toEqual({ temporalPatterns });
  });

  it('flag off: getProfile answers null and the strict read throws, as before', async () => {
    vi.stubEnv('DEVICE_PROFILE_PARTIAL_REPAIR', 'off');
    storeDoc({ temporalPatterns });

    expect(await store.getProfile(UID)).toBeNull();
    expect(invalidLogged()).toBe(true);
    expect(errorLines().some(([msg]) => String(msg).startsWith('getProfile error:'))).toBe(true);
    resetCallStartReads();
    await expect(store.getProfileStrict(UID)).rejects.toBeInstanceOf(InvalidStoredProfileError);
  });

  it('flag unset: the default is off', async () => {
    vi.stubEnv('DEVICE_PROFILE_PARTIAL_REPAIR', '');
    storeDoc({ temporalPatterns });

    expect(await store.getProfile(UID)).toBeNull();
  });
});

describe('only a doc that lacks just its id is repaired (flag on)', () => {
  beforeEach(() => {
    vi.stubEnv('DEVICE_PROFILE_PARTIAL_REPAIR', 'on');
  });

  it.each([
    ['a field of the wrong type', { temporalPatterns, email: 42 }],
    ['an id that is not a string', { id: 7, temporalPatterns }],
    ['the erasure mark', { temporalPatterns, erasing: true, erasingAt: '2026-11-01T00:00:00Z' }],
  ])('%s still throws and reads as null', async (_label, doc) => {
    storeDoc(doc);

    await expect(store.getProfileStrict(UID)).rejects.toBeInstanceOf(InvalidStoredProfileError);
    resetCallStartReads();
    expect(await store.getProfile(UID)).toBeNull();
    expect(invalidLogged()).toBe(true);
  });

  it('keeps every stored field over the defaults', async () => {
    storeDoc({ temporalPatterns, name: 'Robin Testcase', totalConversations: 4 });

    const profile = await store.getProfile(UID);

    expect(profile).toMatchObject({
      id: UID,
      name: 'Robin Testcase',
      totalConversations: 4,
      temporalPatterns,
    });
  });

  it('a valid profile is returned as stored, with no repair logged', async () => {
    storeDoc({ id: UID, name: 'Robin Testcase', totalConversations: 9 });

    expect(await store.getProfile(UID)).toMatchObject({ id: UID, totalConversations: 9 });
    expect(logged.some(([, , msg]) => msg === 'Partial stored profile repaired on read')).toBe(
      false
    );
  });
});
