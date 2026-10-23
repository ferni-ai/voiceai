/**
 * A failed load never lets a write replace what wasn't read.
 *
 * PersistenceStore.load (non-strict, the default for ~35 stores) answered null on a read error,
 * the same as "no doc". Consumers then held defaults ([], 0) and their next set() merge-wrote
 * them over the stored values: payment ledgers, communication style, calendar reminders and the
 * rest. Push subscriptions were worse: removeSubscription filtered an empty list and deleted the
 * user's whole subscription doc, every device.
 *
 * Now the store holds writes for a user whose last load failed, until a load succeeds. Firestore
 * is the in-memory merge fake (a path's reads can fail); the store, the tip ledger and the push
 * service are real. Every assertion reads the stored documents or the write log.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
// Endpoint ownership has its own Firestore docs; not under test here.
vi.mock('../../push-endpoint-owners.js', () => ({
  claimEndpoint: async () => null,
  releaseEndpoint: async () => undefined,
  getEndpointOwner: async () => 'u1',
}));

const { createPersistenceStore, flushAllStores } = await import('../index.js');
const { getUserTips, saveTip } = await import('../../monetization/persistence.js');
const { getPushNotificationsService } = await import('../../push-notifications.js');

// One fake for the file: the persistence layer keeps the first Firestore client it builds.
const state: MergeFakeState = newMergeFakeState();
const failed = new Set<string>();
state.failReads = failed;

/** The merge fake plus the batch API the store's flush uses. */
function fakeDb(s: MergeFakeState) {
  const db = createMergeFakeFirestore(s);
  type Ref = ReturnType<typeof db.doc>;
  const batch = () => {
    const ops: Array<() => Promise<void>> = [];
    return {
      set: (ref: Ref, data: Record<string, unknown>, opts?: { merge?: boolean }) =>
        void ops.push(() => ref.set(data, opts)),
      commit: async () => {
        for (const op of ops) await op();
      },
    };
  };
  return { ...db, batch };
}

const writesTo = (path: string) => state.writes.filter((w) => w.path === path);

fake.db = fakeDb(state);

beforeEach(() => {
  state.docs.clear();
  state.writes.length = 0;
  failed.clear();
});

describe('PersistenceStore after a failed load', () => {
  const PATH = 'bogle_users/u1/style_test/data';
  const store = createPersistenceStore<{ samples: string[] }>({ collection: 'style_test' });

  beforeEach(() => {
    store.clearAllCaches();
    state.docs.set(PATH, { samples: ['a', 'b', 'c'] });
  });

  it('a non-strict load fails: set() and setImmediate() write nothing', async () => {
    failed.add(PATH);
    expect(await store.load('u1')).toBeNull();
    store.set('u1', { samples: ['new'] });
    await store.flush();
    await store.setImmediate('u1', { samples: ['new'] });

    expect(writesTo(PATH)).toEqual([]);
    expect(state.docs.get(PATH)).toEqual({ samples: ['a', 'b', 'c'] });
  });

  it('a strict load fails: writes are held the same way', async () => {
    failed.add(PATH);
    await expect(store.load('u1', { strict: true })).rejects.toThrow('simulated read failure');
    await store.setImmediate('u1', { samples: ['new'] });
    expect(writesTo(PATH)).toEqual([]);
  });

  it('once a load succeeds, writes go through again', async () => {
    failed.add(PATH);
    await store.load('u1');
    failed.clear();
    expect(await store.get('u1')).toEqual({ samples: ['a', 'b', 'c'] });
    await store.setImmediate('u1', { samples: ['a', 'b', 'c', 'd'] });
    expect(state.docs.get(PATH)).toMatchObject({ samples: ['a', 'b', 'c', 'd'] });
  });

  it('no doc: the first write creates it, as before', async () => {
    state.docs.delete(PATH);
    expect(await store.load('u1')).toBeNull();
    store.set('u1', { samples: ['first'] });
    await store.flush();
    expect(state.docs.get(PATH)).toMatchObject({ samples: ['first'] });
  });
});

describe('tip ledger after a failed read', () => {
  const PATH = 'bogle_users/u1/monetization_tips/data';
  const tip = (id: string, cents: number) => ({
    id,
    amountCents: cents,
    status: 'completed' as const,
    createdAt: '2026-10-01T09:00:00.000Z',
    completedAt: '2026-10-01T09:00:00.000Z',
  });

  it('saveTip writes nothing over the stored tips; a good read adds to them', async () => {
    state.docs.set(PATH, {
      tips: [tip('t1', 500), tip('t2', 700)],
      totalTipsCents: 1200,
      tipCount: 2,
    });
    failed.add(PATH);
    await saveTip('u1', tip('t3', 300) as never);
    await flushAllStores();
    expect(writesTo(PATH)).toEqual([]);

    failed.clear();
    expect((await getUserTips('u1')).totalTipsCents).toBe(1200);
    await saveTip('u1', tip('t3', 300) as never);
    await flushAllStores();
    expect(state.docs.get(PATH)).toMatchObject({ totalTipsCents: 1500, tipCount: 3 });
  });
});

describe('push subscriptions after a failed read', () => {
  const PATH = 'bogle_users/u1/push_subscriptions/data';
  const sub = (endpoint: string) => ({
    endpoint,
    keys: { p256dh: 'k', auth: 'a' },
    platform: 'web' as const,
    userId: 'u1',
    createdAt: '2026-10-01T09:00:00.000Z',
  });
  const stored = () =>
    ((state.docs.get(PATH)?.subscriptions ?? []) as Array<{ endpoint: string }>).map(
      (s) => s.endpoint
    );

  beforeEach(() => {
    state.docs.set(PATH, { subscriptions: [sub('https://phone'), sub('https://laptop')] });
  });

  it('removing one device never deletes the doc or drops the other devices', async () => {
    failed.add(PATH);
    await getPushNotificationsService().removeSubscription('u1', 'https://phone');
    expect(writesTo(PATH)).toEqual([]);
    expect(stored()).toEqual(['https://phone', 'https://laptop']);
  });

  it('registering a device never replaces the stored list', async () => {
    failed.add(PATH);
    await getPushNotificationsService().registerSubscription(sub('https://tablet'));
    expect(writesTo(PATH)).toEqual([]);
    expect(stored()).toEqual(['https://phone', 'https://laptop']);
  });

  it('with good reads: remove leaves the rest, register adds, removing the last leaves []', async () => {
    const push = getPushNotificationsService();
    await push.removeSubscription('u1', 'https://phone');
    expect(stored()).toEqual(['https://laptop']);
    await push.registerSubscription(sub('https://tablet'));
    expect(stored()).toEqual(['https://laptop', 'https://tablet']);
    await push.removeSubscription('u1', 'https://laptop');
    await push.removeSubscription('u1', 'https://tablet');
    expect(stored()).toEqual([]);
    expect(writesTo(PATH).every((w) => w.op === 'set')).toBe(true);
  });
});
