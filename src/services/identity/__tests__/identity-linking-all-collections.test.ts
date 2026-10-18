/**
 * Linking a device or anon: identity copies every subcollection of its record (it
 * used to copy a fixed 12 of ~40), and the source's _migratedTo is the one flag
 * that says it is done, read by autoLinkOnAuth and user-migration alike.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Data = Record<string, unknown>;

/** Documents by path, with the reads and writes linking makes. */
const { docs, db, failing } = vi.hoisted(() => {
  const docs = new Map<string, Data>();
  const failing = { listCollections: false, collectionGet: null as string | null };
  const childIds = (path: string, depthOffset: number) => [
    ...new Set(
      [...docs.keys()]
        .filter((p) => p.startsWith(`${path}/`))
        .map((p) => p.slice(path.length + 1).split('/')[depthOffset] as string)
    ),
  ];
  const doc = (path: string): Record<string, unknown> => ({
    id: path.split('/').at(-1),
    path,
    get: async () => ({ exists: docs.has(path), data: () => docs.get(path), ref: doc(path) }),
    set: async (data: Data, opts?: { merge?: boolean }) =>
      void docs.set(path, opts?.merge ? { ...docs.get(path), ...data } : data),
    collection: (id: string) => collection(`${path}/${id}`),
    listCollections: async () => {
      if (failing.listCollections) throw new Error('unavailable');
      return childIds(path, 0).map((id) => collection(`${path}/${id}`));
    },
  });
  const collection = (path: string): Record<string, unknown> => ({
    id: path.split('/').at(-1),
    doc: (id: string) => doc(`${path}/${id}`),
    get: async () => {
      if (failing.collectionGet && path.endsWith(`/${failing.collectionGet}`))
        throw new Error('unavailable');
      return {
        docs: [...docs.keys()]
          .filter(
            (p) => p.startsWith(`${path}/`) && p.split('/').length === path.split('/').length + 1
          )
          .map((p) => ({ id: p.split('/').at(-1), data: () => docs.get(p) })),
      };
    },
    listDocuments: async () => childIds(path, 0).map((id) => doc(`${path}/${id}`)),
  });
  const db = {
    collection,
    batch: () => {
      const ops: Array<() => Promise<unknown>> = [];
      return {
        set: (ref: { set: (d: Data, o: unknown) => Promise<unknown> }, d: Data, o: unknown) =>
          ops.push(() => ref.set(d, o)),
        commit: async () => {
          for (const op of ops) await op();
        },
      };
    },
  };
  return { docs, db, failing };
});
vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => db }));
const store = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../../../memory/firestore-store.js', () => ({ getFirestoreStore: () => store.current }));

const { linkIdentity, autoLinkOnAuth } = await import('../identity-linking.js');
const { getMigratedUid, migrateUserData } = await import('../../user-migration.js');

const UID = 'AbCdEfGhIjKlMnOpQrStUvWxYz12';
const seedDevice = () => {
  docs.set('bogle_users/device:d1', { totalConversations: 3 });
  // Neither was in the old list of 12
  docs.set('bogle_users/device:d1/journal/j1', { text: 'hi' });
  docs.set('bogle_users/device:d1/reminders/r1', { at: 'noon' });
  // A subcollection two levels down
  docs.set('bogle_users/device:d1/conversations/c1', { n: 1 });
  docs.set('bogle_users/device:d1/conversations/c1/turns/t1', { said: 'hello' });
};

beforeEach(async () => {
  docs.clear();
  failing.listCollections = false;
  failing.collectionGet = null;
  const { InMemoryStore } = await import('../../../memory/storage/in-memory-store.js');
  if (!store.current) store.current = new InMemoryStore();
});

describe('linkIdentity', () => {
  it('copies every subcollection at any depth, then sets _migratedTo', async () => {
    seedDevice();
    const result = await linkIdentity('device:d1', UID);
    expect(result.success).toBe(true);
    for (const path of [
      'journal/j1',
      'reminders/r1',
      'conversations/c1',
      'conversations/c1/turns/t1',
    ]) {
      expect(docs.get(`bogle_users/${UID}/${path}`), path).toMatchObject({
        _migratedFrom: 'device:d1',
      });
    }
    expect(docs.get('bogle_users/device:d1')?._migratedTo).toBe(UID);
    expect(await getMigratedUid('device:d1')).toBe(UID);
  });

  it('refuses a source already migrated to another account and copies nothing', async () => {
    seedDevice();
    docs.set('bogle_users/device:d1', { _migratedTo: 'SomeoneElse000000000000000000' });
    const result = await linkIdentity('device:d1', UID);
    expect(result.success).toBe(false);
    expect([...docs.keys()].some((p) => p.startsWith(`bogle_users/${UID}/`))).toBe(false);
  });
});

describe('autoLinkOnAuth', () => {
  it('links an unmigrated device and leaves a migrated one alone', async () => {
    seedDevice();
    await autoLinkOnAuth('d1', UID);
    expect(docs.get('bogle_users/device:d1')?._migratedTo).toBe(UID);

    docs.delete(`bogle_users/${UID}/journal/j1`);
    await autoLinkOnAuth('d1', UID);
    expect(docs.has(`bogle_users/${UID}/journal/j1`)).toBe(false);
  });

  it('treats a pair linked before _migratedTo existed as done', async () => {
    seedDevice();
    docs.set('bogle_users/device:d1', { _migrated: true, migratedTo: UID, totalConversations: 3 });
    await autoLinkOnAuth('d1', UID);
    expect([...docs.keys()].some((p) => p.startsWith(`bogle_users/${UID}/`))).toBe(false);
  });
});

describe('migrateUserData', () => {
  it('reads the persisted flag, so a restart forgets no migration', async () => {
    docs.set('bogle_users/device:d1', { _migratedTo: 'SomeoneElse000000000000000000' });
    const elsewhere = await migrateUserData({ deviceId: 'device:d1', firebaseUid: UID });
    expect(elsewhere).toMatchObject({ success: false, profileAction: 'none' });

    docs.set('bogle_users/device:d1', { _migratedTo: UID });
    const done = await migrateUserData({ deviceId: 'device:d1', firebaseUid: UID });
    expect(done).toMatchObject({ success: true, profileAction: 'none' });
  });
});

describe('migrateUserData marks the device as taken', () => {
  const seedProfile = async (id: string) => {
    const { createUserProfile } = await import('../../../types/user-profile.js');
    await (store.current as { saveProfile: (p: unknown) => Promise<void> }).saveProfile(
      createUserProfile(id, 'On my phone')
    );
  };

  it('copies the record and sets _migratedTo', async () => {
    seedDevice();
    await seedProfile('device:d2');
    docs.set('bogle_users/device:d2/journal/j1', { text: 'x' });
    expect(await migrateUserData({ deviceId: 'device:d2', firebaseUid: UID })).toMatchObject({
      success: true,
    });
    expect(docs.get(`bogle_users/${UID}/journal/j1`)).toBeDefined();
    expect(docs.get('bogle_users/device:d2')?._migratedTo).toBe(UID);
  });

  it('sets _migratedTo even when the copy fails, so no second account can take the device', async () => {
    await seedProfile('device:d3');
    docs.set('bogle_users/device:d3', {});
    failing.listCollections = true;
    expect(await migrateUserData({ deviceId: 'device:d3', firebaseUid: UID })).toMatchObject({
      success: true,
    });
    expect(docs.get('bogle_users/device:d3')?._migratedTo).toBe(UID);
    expect(docs.get('bogle_users/device:d3')?._migrationIncomplete).toBe(true);
    failing.listCollections = false;
    failing.collectionGet = null;
    const other = 'SomeoneElse000000000000000000';
    expect(await migrateUserData({ deviceId: 'device:d3', firebaseUid: other })).toMatchObject({
      success: false,
    });
  });
});

describe('a failed copy is retried, never stranded', () => {
  it('claims the device as incomplete, then a later sign-in finishes the copy and clears it', async () => {
    seedDevice();
    failing.collectionGet = 'reminders';
    const first = await linkIdentity('device:d1', UID);
    expect(first.success).toBe(false);
    expect(docs.get('bogle_users/device:d1')).toMatchObject({
      _migratedTo: UID,
      _migrationIncomplete: true,
    });
    expect(docs.has(`bogle_users/${UID}/journal/j1`)).toBe(true);
    expect(docs.has(`bogle_users/${UID}/reminders/r1`)).toBe(false);

    failing.collectionGet = null;
    await autoLinkOnAuth('d1', UID);
    expect(docs.has(`bogle_users/${UID}/reminders/r1`)).toBe(true);
    expect(docs.get('bogle_users/device:d1')?._migrationIncomplete).toBe(false);
  });

  it('a retry keeps target docs the user changed since, and refreshes stale ones', async () => {
    seedDevice();
    docs.set('bogle_users/device:d1/journal/j1', {
      text: 'device',
      updatedAt: '2026-10-01T00:00:00Z',
    });
    docs.set(`bogle_users/${UID}/journal/j1`, {
      text: 'edited',
      updatedAt: '2026-10-10T00:00:00Z',
    });
    docs.set('bogle_users/device:d1/journal/j2', {
      text: 'device',
      updatedAt: '2026-10-12T00:00:00Z',
    });
    docs.set(`bogle_users/${UID}/journal/j2`, { text: 'older', updatedAt: '2026-10-02T00:00:00Z' });
    docs.set('bogle_users/device:d1', { _migratedTo: UID, _migrationIncomplete: true });
    expect((await linkIdentity('device:d1', UID)).success).toBe(true);
    expect(docs.get(`bogle_users/${UID}/journal/j1`)?.text).toBe('edited');
    expect(docs.get(`bogle_users/${UID}/journal/j2`)?.text).toBe('device');
  });
});
