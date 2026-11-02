/**
 * Re-seal on read must not outlive a disconnect or undo a refresh.
 *
 * The real Google Calendar store and the real persistence store, on the Firestore
 * fake. A hook inside the write simulates the other process landing between the re-seal's read
 * and its write: a disconnect (the doc must stay deleted: no set(), no recreate) and a refresh
 * (the newer token must stay).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMergeFakeFirestore,
  newMergeFakeState,
  type MergeFakeState,
} from '../../../tests/helpers/merge-fake-firestore.js';

const fake = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@google-cloud/firestore', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Firestore: class {
    constructor() {
      return fake.db as object;
    }
  },
}));

const state: MergeFakeState = newMergeFakeState();
fake.db = createMergeFakeFirestore(state);

const { encryptData, decryptData, keyIdOf } = await import('../../../utils/token-encryption.js');
const { resealCountsSnapshot } = await import('../../../utils/token-at-rest.js');
const google = await import('../../identity/google-calendar-token-store.js');

const SEAL = Buffer.alloc(32, 9).toString('base64');
const LEGACY = 'fixture-log-hash-secret';
const OLD = { access_token: 'at-old', refresh_token: 'rt', expires_at: 1_900_000_000_000 };
const NEWER = { ...OLD, access_token: 'at-refreshed' };
const saved = { ...process.env };

const stores = [
  {
    name: 'google calendar',
    path: (uid: string) => `bogle_users/${uid}/google_calendar_tokens/data`,
    read: (uid: string) => google.getTokens(uid),
  },
];

const bump = (path: string) => state.versions.set(path, (state.versions.get(path) ?? 0) + 1);
const settled = () => {
  const c = resealCountsSnapshot();
  return c.resealed + c.changed + c.failed;
};
const kidAt = (path: string) =>
  (JSON.parse(state.docs.get(path)!.encrypted as string) as { kid: string }).kid;

/** Reads the link, then waits for its fire-and-forget re-seal to finish one way or another. */
async function readAndSettle(read: () => Promise<unknown>): Promise<void> {
  const before = settled();
  expect(await read()).toMatchObject({ refresh_token: 'rt' });
  await vi.waitFor(() => expect(settled()).toBe(before + 1));
}

describe.each(stores)('re-seal on read: $name', ({ path, read }) => {
  let uid = 0;
  let p: string;
  beforeEach(() => {
    state.docs.clear();
    state.writes.length = 0;
    state.beforeWrite = undefined;
    delete process.env.OAUTH_ENCRYPTION_KEY;
    process.env.LOG_HASH_SECRET = LEGACY;
    p = path(`u-race-${uid++}`);
    state.docs.set(p, { encrypted: encryptData(OLD), updated_at: 123 });
    process.env.TOKEN_SEALING_KEY = SEAL; // after seeding: the doc is a legacy blob
  });
  afterEach(() => {
    state.beforeWrite = undefined;
    Object.assign(process.env, saved);
    if (saved.TOKEN_SEALING_KEY === undefined) delete process.env.TOKEN_SEALING_KEY;
  });

  const uidOf = () => p.split('/')[1];

  it('the normal path still re-seals: one update, updated_at kept, opens without the log secret', async () => {
    await readAndSettle(() => read(uidOf()));
    expect(kidAt(p)).toBe(keyIdOf(SEAL));
    expect(state.docs.get(p)!.updated_at).toBe(123);
    expect(state.writes.map((w) => w.op)).toEqual(['update']);
    delete process.env.LOG_HASH_SECRET;
    expect(decryptData(state.docs.get(p)!.encrypted as string)).toEqual(OLD);
  });

  it('a disconnect between the read and the write leaves the doc deleted', async () => {
    state.beforeWrite = (path2) => {
      state.beforeWrite = undefined;
      state.docs.delete(path2); // the user disconnects
      bump(path2);
    };
    await readAndSettle(() => read(uidOf()));
    expect(state.docs.has(p)).toBe(false);
    expect(state.writes.filter((w) => w.op === 'set')).toEqual([]);
  });

  it('a refresh between the read and the write is not overwritten', async () => {
    const refreshed = encryptData(NEWER); // sealed with the key a refresh would use now
    state.beforeWrite = (path2) => {
      state.beforeWrite = undefined;
      state.docs.set(path2, { encrypted: refreshed, updated_at: 456 });
      bump(path2);
    };
    await readAndSettle(() => read(uidOf()));
    expect(state.docs.get(p)).toEqual({ encrypted: refreshed, updated_at: 456 });
  });
});
