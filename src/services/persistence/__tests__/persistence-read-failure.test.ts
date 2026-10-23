/**
 * A failed load never lets a write replace what wasn't read, and never drops a write silently.
 *
 * PersistenceStore.load (non-strict, the default for ~35 stores) answered null on a read error,
 * the same as "no doc". Consumers then held defaults ([], 0) and their next write merge-put them
 * over the stored values: payment ledgers, communication style, calendar reminders and the rest.
 * Push subscriptions were worse: removeSubscription filtered an empty list and deleted the
 * user's whole subscription doc, every device.
 *
 * Now, while a key's latest load has failed, setImmediate rejects (ReadFailedWriteError) and
 * set() drops with a warning; writes that don't depend on a read (`safeWithoutRead`) still land.
 * Firestore is the in-memory merge fake (reads can fail or be held); the store, the tip ledger,
 * the Stripe webhook and the push service are real. Assertions read the stored docs and writes.
 */
import Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMergeFakeFirestore,
  newMergeFakeState,
  type MergeFakeState,
} from '../../../tests/helpers/merge-fake-firestore.js';

const fake = vi.hoisted(() => ({
  db: null as unknown,
  claims: [] as string[],
  profiles: new Map<string, Record<string, unknown>>(),
}));
vi.mock('@google-cloud/firestore', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Firestore: class {
    constructor() {
      return fake.db as object;
    }
  },
}));
// Endpoint ownership has its own Firestore docs; recorded, not stored.
vi.mock('../../push-endpoint-owners.js', () => ({
  claimEndpoint: async (endpoint: string) => (fake.claims.push(endpoint), null),
  releaseEndpoint: async () => undefined,
  getEndpointOwner: async () => 'u1',
}));
// recordPayment's profile (MemoryStore): a map, so the webhook's totals can be read back.
vi.mock('../../../memory/store-factory.js', () => ({
  getStore: async () => ({
    getOrCreateProfile: async (id: string) => structuredClone(fake.profiles.get(id) ?? { id }),
    saveProfile: async (p: { id: string }) => void fake.profiles.set(p.id, structuredClone(p)),
  }),
}));

const { createPersistenceStore, flushAllStores } = await import('../index.js');
const { ReadFailedWriteError, loadOrThrow } = await import('../read-guard.js');
const { getUserTips, saveTip } = await import('../../monetization/persistence.js');
const { tipJar } = await import('../../monetization/tip-jar.js');
const { recordPayment } = await import('../../billing/stripe-payments.js');
const { valueCapture } = await import('../../monetization/value-capture.js');
const calendarTokens = await import('../../identity/google-calendar-token-store.js');
const { handleMonetizationWebhook } = await import('../../../api/monetization-webhook.js');
const pushModule = await import('../../push-notifications.js');
const { getPushNotificationsService } = pushModule;
const PushService = pushModule.default;

// One fake for the file: the persistence layer keeps the first Firestore client it builds.
const state: MergeFakeState = newMergeFakeState();
const failed = new Set<string>();
state.failReads = failed;
/** Reads of a path wait for its gate (released by the test); every read is counted. */
const gates = new Map<string, Promise<void>>();
const reads: string[] = [];

/** The merge fake plus the batch API the store's flush uses, with gated, counted reads. */
function fakeDb(s: MergeFakeState) {
  const db = createMergeFakeFirestore(s);
  type Ref = ReturnType<typeof db.doc>;
  type Col = ReturnType<typeof db.collection>;
  const ref = (r: Ref): Ref => ({
    ...r,
    get: async () => {
      reads.push(r.path);
      await gates.get(r.path);
      return r.get();
    },
    collection: (name: string) => col(r.collection(name)),
  });
  const col = (c: Col): Col => ({ ...c, doc: (id: string) => ref(c.doc(id)) });
  const batch = () => {
    const ops: Array<() => Promise<void>> = [];
    return {
      set: (r: Ref, data: Record<string, unknown>, opts?: { merge?: boolean }) =>
        void ops.push(() => r.set(data, opts)),
      commit: async () => {
        for (const op of ops) await op();
      },
    };
  };
  return { ...db, collection: (name: string) => col(db.collection(name)), batch };
}

const writesTo = (path: string) => state.writes.filter((w) => w.path === path);
/** A gate on `path`: reads wait until the returned function is called. */
let readsAtHold = 0;
function hold(path: string): () => void {
  readsAtHold = reads.length;
  let release: () => void = () => {};
  gates.set(path, new Promise<void>((r) => (release = r)));
  return () => {
    gates.delete(path);
    release();
  };
}

fake.db = fakeDb(state);

/** Wait until a held read is waiting at its gate, then open the path for newer reads. */
async function reachedGate(): Promise<void> {
  await vi.waitFor(() => expect(reads.length).toBeGreaterThan(readsAtHold));
  gates.clear();
}

beforeEach(() => {
  fake.profiles.clear();
  state.docs.clear();
  state.writes.length = 0;
  failed.clear();
  gates.clear();
  reads.length = 0;
  fake.claims = [];
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('PersistenceStore after a failed load', () => {
  const PATH = 'bogle_users/u1/style_test/data';
  const store = createPersistenceStore<{ samples: string[] }>({ collection: 'style_test' });

  beforeEach(() => {
    store.clearAllCaches();
    state.docs.set(PATH, { samples: ['a', 'b', 'c'] });
  });

  it('a non-strict load fails: setImmediate rejects and nothing is written', async () => {
    failed.add(PATH);
    expect(await store.load('u1')).toBeNull();
    expect(store.readFailed('u1')).toBe(true);
    await expect(store.setImmediate('u1', { samples: ['new'] })).rejects.toBeInstanceOf(
      ReadFailedWriteError
    );

    expect(writesTo(PATH)).toEqual([]);
    expect(state.docs.get(PATH)).toEqual({ samples: ['a', 'b', 'c'] });
  });

  it('a doc that reads but fails to convert counts as a failed read, not a good one', async () => {
    state.docs.set(PATH, { samples: ['a'], broken: () => 'not cloneable' }); // data() throws
    expect(await store.load('u1')).toBeNull();
    expect(store.readFailed('u1')).toBe(true);
    await expect(store.setImmediate('u1', { samples: ['new'] })).rejects.toBeInstanceOf(
      ReadFailedWriteError
    );
    expect(writesTo(PATH)).toEqual([]);
  });

  it('a strict load fails: the write is refused the same way', async () => {
    failed.add(PATH);
    await expect(store.load('u1', { strict: true })).rejects.toThrow('simulated read failure');
    await expect(store.setImmediate('u1', { samples: ['new'] })).rejects.toBeInstanceOf(
      ReadFailedWriteError
    );
    expect(writesTo(PATH)).toEqual([]);
  });

  it('a write that does not depend on a read (safeWithoutRead) still lands', async () => {
    failed.add(PATH);
    await store.load('u1');
    await store.setImmediate('u1', { samples: ['granted'] }, { safeWithoutRead: true });
    expect(state.docs.get(PATH)).toMatchObject({ samples: ['granted'] });
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

  it('a slow failing load that started first cannot mark the key after a newer success', async () => {
    const release = hold(PATH);
    const older = store.load('u1', { fresh: true }); // held; fails when released
    await reachedGate();
    expect(await store.load('u1', { fresh: true })).toEqual({ samples: ['a', 'b', 'c'] });
    failed.add(PATH);
    release();
    await older;
    failed.clear();

    expect(store.readFailed('u1')).toBe(false);
    await store.setImmediate('u1', { samples: ['a', 'b', 'c', 'd'] });
    expect(state.docs.get(PATH)).toMatchObject({ samples: ['a', 'b', 'c', 'd'] });
  });

  it('a slow succeeding load that started first cannot clear a newer failure', async () => {
    const release = hold(PATH);
    const older = store.load('u1', { fresh: true }); // held; succeeds when released
    await reachedGate();
    failed.add(PATH);
    await store.load('u1', { fresh: true });
    failed.clear();
    release();
    await older;

    expect(store.readFailed('u1')).toBe(true);
  });

  it('loadOrThrow reports its own failed read, even if a newer load succeeds in between', async () => {
    const release = hold(PATH);
    const older = loadOrThrow(store, 'u1', 'style_test'); // held; fails when released
    await reachedGate();
    expect(await store.load('u1', { fresh: true })).toEqual({ samples: ['a', 'b', 'c'] });
    failed.add(PATH);
    release();

    await expect(older).rejects.toBeInstanceOf(ReadFailedWriteError);
  });

  it('while marked, the cache is not authoritative: get() reloads after the backoff', async () => {
    expect(await store.get('u1')).toEqual({ samples: ['a', 'b', 'c'] }); // cached
    failed.add(PATH);
    await store.load('u1', { fresh: true }); // fails: marked, the old copy still cached
    failed.clear();
    const readsBefore = reads.length;

    await store.get('u1'); // inside the 1 s backoff: served from cache, no read
    expect(reads.length).toBe(readsBefore);

    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 1_500);
    await store.get('u1'); // backoff passed: reads again, and the success clears the mark
    expect(reads.length).toBe(readsBefore + 1);
    expect(store.readFailed('u1')).toBe(false);
  });
});

describe('a new OAuth grant after a failed token read', () => {
  it('saves: token writes never come from a read', async () => {
    const PATH = 'bogle_users/u1/google_calendar_tokens/data';
    state.docs.set(PATH, { encrypted: 'old-grant', updated_at: 1 });
    failed.add(PATH);
    expect(await calendarTokens.getTokens('u1')).toBeNull(); // the read failed
    failed.clear();

    const grant = { access_token: 'at-new', refresh_token: 'rt-new', expiry_date: 1 };
    await calendarTokens.saveTokens('u1', grant as never);
    expect(writesTo(PATH)).toHaveLength(1);
    expect(state.docs.get(PATH)?.encrypted).not.toBe('old-grant');
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

  it('saveTip rejects and writes nothing; after a good read it adds to the stored tips', async () => {
    state.docs.set(PATH, {
      tips: [tip('t1', 500), tip('t2', 700)],
      totalTipsCents: 1200,
      tipCount: 2,
    });
    failed.add(PATH);
    await expect(saveTip('u1', tip('t3', 300) as never)).rejects.toBeInstanceOf(
      ReadFailedWriteError
    );
    await flushAllStores();
    expect(writesTo(PATH)).toEqual([]);

    failed.clear();
    expect((await getUserTips('u1')).totalTipsCents).toBe(1200);
    await saveTip('u1', tip('t3', 300) as never);
    expect(state.docs.get(PATH)).toMatchObject({ totalTipsCents: 1500, tipCount: 3 });
  });
});

describe('Stripe webhook for a tip while the ledger read fails', () => {
  const USER = 'tipper-1';
  const PATH = `bogle_users/${USER}/monetization_tips/data`;
  const SECRET = 'whsec_failread_test';

  async function webhook(tipId: string, user = USER, paymentType = 'tip') {
    const body = JSON.stringify({
      id: 'evt_failread',
      object: 'event',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_failread',
          object: 'payment_intent',
          amount: 500,
          metadata: {
            ferni_user_id: user,
            payment_type: paymentType,
            tip_id: tipId,
            event_id: tipId,
          },
        },
      },
    });
    const signature = new Stripe('sk_test_signer').webhooks.generateTestHeaderString({
      payload: body,
      secret: SECRET,
    });
    return handleMonetizationWebhook({ headers: { 'stripe-signature': signature }, body });
  }

  beforeEach(async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_server');
    vi.stubEnv('STRIPE_MONETIZATION_WEBHOOK_SECRET', SECRET);
    const { resetConfig } = await import('../../../config/environment.js');
    resetConfig();
  });

  it('answers 500 (so Stripe retries) and writes nothing; once reads recover, 200', async () => {
    state.docs.set(PATH, { tips: [{ id: 'old', amountCents: 900, status: 'completed' }] });
    failed.add(PATH);
    // The pending tip lives in memory; its first save is refused by the same failed read.
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const tipId = `tip_1700000000000_${(0.5).toString(36).slice(2, 9)}`;
    await expect(tipJar.create({ userId: USER, amountCents: 500 })).rejects.toBeInstanceOf(
      ReadFailedWriteError
    );
    vi.restoreAllMocks();

    const refused = await webhook(tipId);
    expect(refused.status).toBe(500);
    expect(writesTo(PATH)).toEqual([]);

    failed.clear();
    const retried = await webhook(tipId);
    expect(retried.status).toBe(200);
    const ids = (state.docs.get(PATH)?.tips as Array<{ id: string }>).map((t) => t.id);
    expect(ids).toEqual(['old', tipId]);
  });

  it('the retry counts the payment exactly once (profile totals and tip-jar stats)', async () => {
    const user = 'tipper-2'; // its own ledger doc: nothing cached by the test above
    const ledger = `bogle_users/${user}/monetization_tips/data`;
    const statsBefore = tipJar.getStats();
    failed.add(ledger);
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_001);
    vi.spyOn(Math, 'random').mockReturnValue(0.25);
    const tipId = `tip_1700000000001_${(0.25).toString(36).slice(2, 9)}`;
    await expect(tipJar.create({ userId: user, amountCents: 500 })).rejects.toBeInstanceOf(
      ReadFailedWriteError
    );
    vi.restoreAllMocks();

    expect((await webhook(tipId, user)).status).toBe(500); // first attempt: ledger read fails
    failed.clear();
    expect((await webhook(tipId, user)).status).toBe(200); // Stripe's retry of the same event

    const monetization = fake.profiles.get(user)?.monetization as Record<string, unknown>;
    expect(monetization).toMatchObject({ totalTipsCents: 500, tipCount: 1 });
    expect(tipJar.getStats().tipCount - statsBefore.tipCount).toBe(1);
    expect(tipJar.getStats().totalTipsCents - statsBefore.totalTipsCents).toBe(500);
  });
  it('a value-capture retry is counted exactly once too', async () => {
    const user = 'contributor-1';
    vi.stubEnv('PAYWALL', 'on');
    const statsBefore = valueCapture.getStats();
    failed.add(`bogle_users/${user}/monetization_value_capture/data`);
    // The detected event lives in memory; its first save is refused by the same failed read.
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_002);
    vi.spyOn(Math, 'random').mockReturnValue(0.75);
    const eventId = `val_1700000000002_${(0.75).toString(36).slice(2, 9)}`;
    const detecting = valueCapture.detect({
      userId: user,
      message: 'I got a raise!',
      conversationId: 'c1',
    });
    await expect(detecting).rejects.toBeInstanceOf(ReadFailedWriteError);
    vi.restoreAllMocks();

    expect((await webhook(eventId, user, 'value_capture')).status).toBe(500);
    failed.clear();
    expect((await webhook(eventId, user, 'value_capture')).status).toBe(200);

    const monetization = fake.profiles.get(user)?.monetization as Record<string, unknown>;
    expect(monetization).toMatchObject({ totalValueContributionsCents: 500, valueEventCount: 1 });
    expect(valueCapture.getStats().contributionCount - statsBefore.contributionCount).toBe(1);
  });
});

describe('recordPayment remembers the payment intents it counted', () => {
  const pay = (id: string) =>
    recordPayment({ userId: 'payer', type: 'tip', amountCents: 100, paymentIntentId: id });

  it('an older intent replayed after a newer one is still not counted again', async () => {
    await pay('pi_1');
    await pay('pi_2');
    const after = await pay('pi_1'); // Stripe retries an older event
    expect(after).toMatchObject({ tipCount: 2, totalTipsCents: 200 });
  });

  it('keeps the newest 200 ids, not an unbounded list', async () => {
    for (let i = 0; i <= 200; i++) await pay(`pi_${i}`);
    const ids = (fake.profiles.get('payer')?.monetization as { recordedPaymentIds: string[] })
      .recordedPaymentIds;
    expect(ids).toHaveLength(200);
    expect(ids[0]).toBe('pi_1');
    expect(ids.at(-1)).toBe('pi_200');
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

  it('removing one device rejects: no delete, no rewrite, both devices kept', async () => {
    failed.add(PATH);
    const removing = getPushNotificationsService().removeSubscription('u1', 'https://phone');
    await expect(removing).rejects.toBeInstanceOf(ReadFailedWriteError);
    expect(writesTo(PATH)).toEqual([]);
    expect(stored()).toEqual(['https://phone', 'https://laptop']);
  });

  it('registering rejects before the endpoint is claimed, and the list is kept', async () => {
    failed.add(PATH);
    const registering = getPushNotificationsService().registerSubscription(sub('https://tablet'));
    await expect(registering).rejects.toBeInstanceOf(ReadFailedWriteError);
    expect(fake.claims).toEqual([]);
    expect(writesTo(PATH)).toEqual([]);
    expect(stored()).toEqual(['https://phone', 'https://laptop']);
  });

  it('removing an endpoint missing from the stored list writes nothing (no doc after erase)', async () => {
    state.docs.delete(PATH);
    await getPushNotificationsService().removeSubscription('u1', 'https://phone');
    expect(writesTo(PATH)).toEqual([]);
    expect(state.docs.has(PATH)).toBe(false);
  });

  it('with good reads: remove leaves the rest, register adds, removing the last leaves []', async () => {
    const push = getPushNotificationsService();
    await push.removeSubscription('u1', 'https://phone');
    expect(stored()).toEqual(['https://laptop']);
    await push.registerSubscription(sub('https://tablet'));
    expect(fake.claims).toEqual(['https://tablet']);
    expect(stored()).toEqual(['https://laptop', 'https://tablet']);
    await push.removeSubscription('u1', 'https://laptop');
    await push.removeSubscription('u1', 'https://tablet');
    expect(stored()).toEqual([]);
    expect(writesTo(PATH).every((w) => w.op === 'set')).toBe(true);
  });

  it('a failed startup load of scheduled notifications does not stop new ones persisting', async () => {
    const SCHEDULED = 'scheduled_notifications/global';
    state.docs.set(SCHEDULED, { notifications: { old: { id: 'old', status: 'pending' } } });
    failed.add(SCHEDULED);
    const service = new PushService();
    await service.initialize(); // its one 'global' load fails
    failed.clear();

    const id = await service.scheduleNotification(
      'u1',
      { type: 'general', title: 't', body: 'b' } as never,
      new Date(Date.now() + 60_000)
    );
    await flushAllStores();
    const notifications = state.docs.get(SCHEDULED)?.notifications as Record<string, unknown>;
    expect(Object.keys(notifications).sort()).toEqual([id, 'old'].sort()); // merged, old kept
  });
});
