import { beforeEach, describe, expect, it, vi } from 'vitest';

const getFirebaseUserOrThrow = vi.hoisted(() => vi.fn());
vi.mock('../../identity/firebase-auth.js', () => ({
  ensureFirebaseAdmin: () => false,
  getFirebaseUserOrThrow,
}));
const logged = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }));
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/safe-logger.js')>()),
  createLogger: () => ({ ...logged, child: () => logged }),
}));

import { emailDocId, KEYED_STORES } from '../erase-other-keys.js';
import { gatherErasureKeys, type ErasureKeys } from '../erasure-keys.js';
import { eraseUserRecord } from '../erase-user-record.js';
import { phoneHoldId } from '../../outreach/checkin-replies.js';

type Data = Record<string, unknown>;

/**
 * A Firestore holding documents by path with their fields: enough for the reads the
 * keyed stores make (doc reads, ==/>/in/array-contains-any queries, counts,
 * name-ordered pages, listDocuments, transactions and recursive deletes). Records
 * every page read.
 */
function fakeFirestore(seed: Record<string, Data>) {
  const docs = new Map(Object.entries(seed));
  const pagesRead: string[][] = [];
  const field = (data: Data | undefined, path: string): unknown =>
    path.split('.').reduce<unknown>((v, k) => (v as Data | undefined)?.[k], data);
  const valueAt = (docPath: string, f: string): unknown =>
    f === '__name__' ? docPath.split('/').pop() : field(docs.get(docPath), f);
  const snap = (path: string) => ({
    id: path.split('/').pop() ?? '',
    ref: docRef(path),
    exists: docs.has(path),
    get: (f: string) => field(docs.get(path), f),
    data: () => docs.get(path),
  });
  const docRef = (path: string): Record<string, unknown> => ({
    id: path.split('/').pop(),
    path,
    get: async () => snap(path),
    set: async (data: Data, opts?: { merge?: boolean }) =>
      void docs.set(path, opts?.merge ? { ...docs.get(path), ...data } : data),
    // As Firestore's: the document must exist (the erasure's `erasing` mark)
    update: async (data: Data) => {
      if (!docs.has(path)) throw Object.assign(new Error('5 NOT_FOUND'), { code: 5 });
      docs.set(path, { ...docs.get(path), ...data });
    },
    collection: (name: string) => collection(`${path}/${name}`),
    listCollections: async () =>
      [
        ...new Set(
          [...docs.keys()]
            .filter((p) => p.startsWith(`${path}/`))
            .map((p) => p.slice(path.length + 1).split('/')[0])
        ),
      ].map((id) => ({ id })),
  });
  type Filter = (path: string) => boolean;
  const query = (
    name: string,
    filters: Filter[],
    limit = Infinity,
    from?: string,
    to?: string
  ) => ({
    where: (f: string, op: string, v: unknown) =>
      query(
        name,
        [
          ...filters,
          (p: string) => {
            const value = valueAt(p, f);
            if (op === '==') return value === v;
            if (op === '>') return String(value) > String(v);
            if (op === '<') return String(value) < String(v);
            if (op === 'in') return (v as unknown[]).includes(value);
            if (op === 'array-contains-any')
              return Array.isArray(value) && value.some((x) => (v as unknown[]).includes(x));
            throw new Error(`op ${op}`);
          },
        ],
        limit,
        from,
        to
      ),
    orderBy: () => query(name, filters, limit, from, to),
    select: () => query(name, filters, limit, from, to),
    limit: (n: number) => query(name, filters, n, from, to),
    startAfter: (s: { id: string }) => query(name, filters, limit, s.id, to),
    endAt: (id: string) => query(name, filters, limit, from, `${id}\0`),
    count: () => ({
      get: async () => {
        const n = [...docs.keys()].filter(
          (p) =>
            p.startsWith(`${name}/`) &&
            p.split('/').length === name.split('/').length + 1 &&
            filters.every((f) => f(p))
        ).length;
        return { data: () => ({ count: n }) };
      },
    }),
    get: async () => {
      const ids = [...docs.keys()]
        .filter(
          (p) => p.startsWith(`${name}/`) && p.split('/').length === name.split('/').length + 1
        )
        .filter((p) => filters.every((f) => f(p)))
        .map((p) => p.slice(name.length + 1))
        .sort()
        .filter((id) => (from === undefined || id > from) && (to === undefined || id < to))
        .slice(0, limit);
      pagesRead.push(ids);
      const found = ids.map((id) => snap(`${name}/${id}`));
      return { empty: found.length === 0, size: found.length, docs: found };
    },
  });
  const collection = (name: string) => ({
    ...query(name, []),
    doc: (id: string) => docRef(`${name}/${id}`),
    listDocuments: async () =>
      [
        ...new Set(
          [...docs.keys()].filter((p) => p.startsWith(`${name}/`)).map((p) => p.split('/')[1])
        ),
      ].map((id) => docRef(`${name}/${id}`)),
  });
  const db = {
    collection,
    recursiveDelete: vi.fn(async (ref: { path: string }) => {
      for (const p of [...docs.keys()])
        if (p === ref.path || p.startsWith(`${ref.path}/`)) docs.delete(p);
    }),
    runTransaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) =>
      fn({
        get: async (ref: { path: string }) => snap(ref.path),
        update: (ref: { path: string }, data: Data) =>
          docs.set(ref.path, { ...docs.get(ref.path), ...data }),
      })
    ),
  };
  return { db: db as unknown as FirebaseFirestore.Firestore, raw: db, docs, pagesRead };
}

const keysFor = (over: Partial<ErasureKeys> = {}): ErasureKeys => ({
  userId: 'u-1',
  linkedUserIds: [],
  phones: [],
  emails: [],
  sponsoredIdentityIds: [],
  stripeCustomerIds: [],
  ...over,
});

const store = (label: string) => {
  const found = KEYED_STORES.find((s) => s.label === label);
  if (!found) throw new Error(`no keyed store ${label}`);
  return found;
};

describe('KEYED_STORES', () => {
  it("erases the person's waitlist place and access grant, never one naming someone else", async () => {
    const mine = emailDocId('me@example.com');
    const shared = emailDocId('shared@example.com');
    const { db, docs } = fakeFirestore({
      [`waitlist/${mine}`]: { email: 'me@example.com' },
      [`user_profiles/${mine}`]: { email: 'me@example.com', firebaseUid: 'u-1' },
      [`user_profiles/${shared}`]: { email: 'shared@example.com', firebaseUid: 'u-2' },
      [`waitlist/${emailDocId('other@example.com')}`]: { email: 'other@example.com' },
    });
    const keys = keysFor({ emails: ['me@example.com', 'shared@example.com'] });
    for (const label of ['waitlist/{email}', 'user_profiles/{email}']) {
      expect(await store(label).remains(db, keys)).toBe(true);
      await store(label).erase(db, keys);
      expect(await store(label).remains(db, keys)).toBe(false);
    }
    expect([...docs.keys()].sort()).toEqual(
      [`user_profiles/${shared}`, `waitlist/${emailDocId('other@example.com')}`].sort()
    );
  });

  it('erases the phone index of the identities the person sponsors, and A/B assignments of every linked uid', async () => {
    const { db, docs } = fakeFirestore({
      'sponsored_identity_phone_index/+15550001': { identityId: 'si-1' },
      'sponsored_identity_phone_index/+15550002': { identityId: 'si-other' },
      'ab_tests/t1': { name: 't1' },
      'ab_tests/t1/assignments/u-1': {},
      'ab_tests/t1/assignments/phone:+15550001': {},
      'ab_tests/t1/assignments/u-2': {},
    });
    const keys = keysFor({ sponsoredIdentityIds: ['si-1'], linkedUserIds: ['phone:+15550001'] });
    await store('sponsored_identity_phone_index[identityId]').erase(db, keys);
    await store('ab_tests/*/assignments/{uid}').erase(db, keys);
    expect([...docs.keys()].sort()).toEqual(
      [
        'ab_tests/t1',
        'ab_tests/t1/assignments/u-2',
        'sponsored_identity_phone_index/+15550002',
      ].sort()
    );
  });

  it("erases the minor-care hold on the person's numbers (phone#<hash>), never another number's", async () => {
    vi.stubEnv('LOG_HASH_SECRET', 'test-secret');
    const mine = phoneHoldId('+15550000001') ?? '';
    const other = phoneHoldId('+15550000009') ?? '';
    const { db, docs } = fakeFirestore({
      [`minor_care_holds/${mine}`]: { heldUntil: 1, v: 1 },
      [`minor_care_holds/${other}`]: { heldUntil: 1, v: 1 },
    });
    const holds = store('minor_care_holds/{phone#hash}');
    const keys = keysFor({ phones: ['+15550000001'] });
    expect(await holds.remains(db, keys)).toBe(true);
    await holds.erase(db, keys);
    expect(await holds.remains(db, keys)).toBe(false);
    expect([...docs.keys()]).toEqual([`minor_care_holds/${other}`]);
    vi.unstubAllEnvs();
  });

  it("erases the router's turn events of every linked uid on every day, leaving everyone else's", async () => {
    const label = 'semantic_router_events/*/events[userId]';
    const { db, docs } = fakeFirestore({
      'semantic_router_events/2026-03-01/events/e1': { userId: 'u-1', toolId: 'weather' },
      'semantic_router_events/2026-03-01/events/e2': { userId: 'u-2', toolId: 'music' },
      'semantic_router_events/2026-10-24/events/e3': { userId: 'u-1', toolId: 'timer' },
      'semantic_router_events/2026-10-24/events/e4': { userId: 'phone:+15550001' },
    });
    const keys = keysFor({ linkedUserIds: ['phone:+15550001'] });
    expect(await store(label).remains(db, keys)).toBe(true);
    await store(label).erase(db, keys);
    expect(await store(label).remains(db, keys)).toBe(false);
    expect([...docs.keys()]).toEqual(['semantic_router_events/2026-03-01/events/e2']);
  });

  it('takes the person and their linked phone profile out of every cohort, leaving other members', async () => {
    const { db, docs } = fakeFirestore({
      'feature_cohorts/friends-and-family': { members: ['u-1', 'u-2', 'phone:+1'], enabled: true },
      'feature_cohorts/beta': { members: ['u-3'] },
    });
    const cohorts = store('feature_cohorts[members]');
    const keys = keysFor({ linkedUserIds: ['phone:+1'] });
    expect(await cohorts.remains(db, keys)).toBe(true);
    await cohorts.erase(db, keys);
    expect(docs.get('feature_cohorts/friends-and-family')).toEqual({
      members: ['u-2'],
      enabled: true,
    });
    expect(docs.get('feature_cohorts/beta')).toEqual({ members: ['u-3'] });
    expect(await cohorts.remains(db, keys)).toBe(false);
  });

  it('strips the uid from unmarked batches only, in a transaction, leaving everyone else', async () => {
    const { db, raw, docs } = fakeFirestore({
      'tool_usage_calls/batch_1700000000000': {
        calls: [
          { toolId: 'a', userId: 'u-1' },
          { toolId: 'b', userId: 'u-2' },
        ],
      },
      'tool_usage_calls/batch_1700000000001': { calls: [{ toolId: 'c', userId: 'u-2' }] },
      'tool_usage_calls/batch_1800000000000': { calls: [{ toolId: 'd' }], noUserIds: true },
    });
    const calls = store('tool_usage_calls[calls.userId]');
    expect(await calls.remains(db, keysFor())).toBe(true);
    await calls.erase(db, keysFor());

    expect(docs.get('tool_usage_calls/batch_1700000000000')?.['calls']).toEqual([
      { toolId: 'a' },
      { toolId: 'b', userId: 'u-2' },
    ]);
    expect(docs.get('tool_usage_calls/batch_1700000000001')?.['calls']).toEqual([
      { toolId: 'c', userId: 'u-2' },
    ]);
    expect(raw.runTransaction).toHaveBeenCalledTimes(1);
    expect(await calls.remains(db, keysFor())).toBe(false);
  });

  it('once nothing unmarked was written after the last one seen, reads no later batch', async () => {
    const { db, docs, pagesRead } = fakeFirestore({
      'tool_usage_calls/batch_1700000000000': { calls: [{ toolId: 'a', userId: 'u-2' }] },
      'tool_usage_calls/batch_1800000000000': { calls: [{ toolId: 'd' }], noUserIds: true },
    });
    const calls = store('tool_usage_calls[calls.userId]');
    await calls.erase(db, keysFor());
    expect(docs.get('analytics_meta/tool_usage_calls')).toEqual({
      lastUnmarked: 'batch_1700000000000',
    });
    docs.set('tool_usage_calls/batch_1900000000000', { calls: [{ toolId: 'e' }], noUserIds: true });
    pagesRead.length = 0;

    await calls.erase(db, keysFor());

    expect(pagesRead.flat()).not.toContain('batch_1900000000000');
    expect(pagesRead.flat()).not.toContain('batch_1800000000000');
  });

  it('finds a batch an old writer wrote after the new writer started (an uneven rollout)', async () => {
    const { db, docs } = fakeFirestore({
      'tool_usage_calls/batch_1700000000000': { calls: [{ toolId: 'a', userId: 'u-2' }] },
      'tool_usage_calls/batch_1800000000000': { calls: [{ toolId: 'd' }], noUserIds: true },
    });
    const calls = store('tool_usage_calls[calls.userId]');
    await calls.erase(db, keysFor()); // remembers batch_1700000000000
    // Days later, an agent not yet redeployed writes the old way
    docs.set('tool_usage_calls/batch_1900000000000', { calls: [{ toolId: 'e', userId: 'u-1' }] });

    expect(await calls.remains(db, keysFor())).toBe(true);
    await calls.erase(db, keysFor());

    expect(docs.get('tool_usage_calls/batch_1900000000000')?.['calls']).toEqual([{ toolId: 'e' }]);
    expect(await calls.remains(db, keysFor())).toBe(false);
  });

  it('pages past the first 300 batches', async () => {
    const seed: Record<string, Data> = {};
    for (let i = 0; i < 650; i++) {
      seed[`tool_usage_calls/batch_${1700000000000 + i}`] = {
        calls: [{ toolId: 't', userId: [0, 299, 300, 301, 599, 649].includes(i) ? 'u-1' : 'u-2' }],
      };
    }
    const { db, docs } = fakeFirestore(seed);
    await store('tool_usage_calls[calls.userId]').erase(db, keysFor());
    const named = [...docs.values()].filter((d) =>
      (d['calls'] as Data[] | undefined)?.some((c) => c['userId'] === 'u-1')
    );
    const others = [...docs.values()].filter((d) =>
      (d['calls'] as Data[] | undefined)?.some((c) => c['userId'] === 'u-2')
    );
    expect(named).toEqual([]);
    expect(others).toHaveLength(644);
  });
});

describe('gatherErasureKeys', () => {
  beforeEach(() => {
    getFirebaseUserOrThrow.mockReset();
  });

  it('throws when the Firebase lookup fails, rather than gathering no email', async () => {
    getFirebaseUserOrThrow.mockImplementation(async () => {
      throw new Error('quota exceeded');
    });
    const { db } = fakeFirestore({});
    await expect(gatherErasureKeys(db, 'u-1')).rejects.toThrow('quota exceeded');
  });

  it('takes the emails on the access grants when the Firebase user is gone', async () => {
    getFirebaseUserOrThrow.mockResolvedValue(null);
    const { db } = fakeFirestore({
      'user_profiles/g1': { email: ' Me@Example.com ', firebaseUid: 'u-1' },
      'user_profiles/g2': { email: 'them@example.com', firebaseUid: 'u-2' },
      'bogle_users/u-1': { contactInfo: { email: 'typed@example.com' } }, // anyone can type this
    });
    expect((await gatherErasureKeys(db, 'u-1')).emails).toEqual(['me@example.com']);
  });

  it('links only phone profiles proven to be the person', async () => {
    getFirebaseUserOrThrow.mockResolvedValue({
      emailVerified: false,
      email: 'unverified@example.com',
      phoneNumber: '+15550000001',
      providerData: [{ providerId: 'google.com' }],
    });
    const { db } = fakeFirestore({
      'bogle_users/u-1': { linkedIdentifiers: ['phone:(555) 000-0002'] },
      'bogle_users/phone:+15550000001': { subscription: { stripeCustomerId: 'cus_1' } },
      'bogle_users/phone:+15550000002': {},
      'bogle_users/phone:+15550000003': { linkedIdentifiers: ['auth:google.com:u-1'] },
      'bogle_users/phone:+155500000011': {}, // a similar number, someone else's
      'bogle_users/phone:+15550000004': { linkedIdentifiers: ['auth:default:u-2'] },
      'sponsored_identities/si-1': { sponsorUserId: 'phone:+15550000002' },
    });
    const keys = await gatherErasureKeys(db, 'u-1');
    expect(keys.emails).toEqual([]);
    expect(keys.linkedUserIds.sort()).toEqual([
      'phone:+15550000001',
      'phone:+15550000002',
      'phone:+15550000003',
    ]);
    expect(keys.sponsoredIdentityIds).toEqual(['si-1']);
    expect(keys.stripeCustomerIds).toEqual(['cus_1']);
    // The numbers whose minor-care holds go with the account: sign-in, links, linked profiles
    expect(keys.phones.sort()).toEqual(['+15550000001', '+15550000002', '+15550000003']);
  });

  it.each(['google.com', 'apple.com', 'password'])(
    'finds a phone profile linked under auth:%s once the Firebase user is gone',
    async (provider) => {
      getFirebaseUserOrThrow.mockResolvedValue(null); // no provider list to read
      const { db } = fakeFirestore({
        'bogle_users/phone:+15550000005': { linkedIdentifiers: [`auth:${provider}:u-1`] },
        'bogle_users/phone:+15550000006': { linkedIdentifiers: [`auth:${provider}:u-2`] },
      });
      expect((await gatherErasureKeys(db, 'u-1')).linkedUserIds).toEqual(['phone:+15550000005']);
    }
  );

  it('a phone profile that linked another sign-in is not erased, even on the verified number', async () => {
    getFirebaseUserOrThrow.mockResolvedValue({ phoneNumber: '+15550000009', providerData: [] });
    const { db } = fakeFirestore({
      'bogle_users/phone:+15550000009': { linkedIdentifiers: ['auth:default:u-2'] },
      // Linked to this sign-in and someone else's: theirs too
      'bogle_users/phone:+15550000008': {
        linkedIdentifiers: ['auth:default:u-1', 'auth:google.com:u-2'],
      },
    });
    expect((await gatherErasureKeys(db, 'u-1')).linkedUserIds).toEqual([]);
  });
});

describe('eraseUserRecord with keyed stores', () => {
  it('erases nothing and fails when the keys cannot be read', async () => {
    getFirebaseUserOrThrow.mockRejectedValue(new Error('unavailable'));
    const { db, docs } = fakeFirestore({
      'bogle_users/u-1': {},
      [`waitlist/${emailDocId('me@example.com')}`]: {},
    });
    await expect(
      eraseUserRecord('u-1', db, [{ collection: 'bogle_users', doc: 'uid' }])
    ).rejects.toThrow('keys unreadable, so not erased: waitlist/{email}');
    expect(docs.size).toBe(2);
  });

  it("logs the failed key lookup's code, not its message", async () => {
    logged.error.mockClear();
    getFirebaseUserOrThrow.mockRejectedValue(
      Object.assign(new Error('lookup failed for someone@example.com'), {
        code: 'auth/internal-error',
      })
    );
    const { db } = fakeFirestore({ 'bogle_users/u-1': {} });
    await expect(
      eraseUserRecord('u-1', db, [{ collection: 'bogle_users', doc: 'uid' }])
    ).rejects.toThrow('keys unreadable');
    expect(logged.error).toHaveBeenCalledWith(
      { error: 'Error:auth/internal-error', userId: 'u-1' },
      expect.any(String)
    );
    expect(JSON.stringify(logged.error.mock.calls)).not.toContain('example.com');
  });

  it('erases a phone profile linked by a non-default sign-in after the Firebase user is gone', async () => {
    getFirebaseUserOrThrow.mockResolvedValue(null);
    const { db, docs } = fakeFirestore({
      'bogle_users/u-1': {},
      'bogle_users/phone:+15550000007': { linkedIdentifiers: ['auth:apple.com:u-1'] },
      'bogle_users/phone:+15550000007/summaries/s1': {},
    });
    await eraseUserRecord('u-1', db, [{ collection: 'bogle_users', doc: 'uid' }]);
    expect([...docs.keys()]).toEqual([]);
  });

  it("erases a linked phone profile's record like the uid's, and keeps the Stripe id first", async () => {
    getFirebaseUserOrThrow.mockResolvedValue({ phoneNumber: '+15550000001', providerData: [] });
    const { db, docs } = fakeFirestore({
      'bogle_users/u-1': { subscription: { stripeCustomerId: 'cus_9' } },
      'bogle_users/phone:+15550000001': {},
      'bogle_users/phone:+15550000001/summaries/s1': {},
    });
    await eraseUserRecord('u-1', db, [{ collection: 'bogle_users', doc: 'uid' }]);
    expect([...docs.keys()]).toEqual(['billing_cleanup/cus_9']);
    expect(docs.get('billing_cleanup/cus_9')).toMatchObject({ stripeCustomerId: 'cus_9' });
  });

  it('keeps the records the keys come from until everything else is gone, so a retry finds them', async () => {
    getFirebaseUserOrThrow.mockResolvedValue(null); // the Firebase user is already gone
    const waitlist = `waitlist/${emailDocId('me@example.com')}`;
    const { db, docs } = fakeFirestore({
      'user_profiles/g1': { email: 'me@example.com', firebaseUid: 'u-1' },
      'bogle_users/u-1': {},
      [waitlist]: { email: 'me@example.com' },
    });
    let failures = 1;
    const flaky = {
      label: 'flaky',
      erase: async () => {
        if (failures-- > 0) throw new Error('unavailable');
      },
      remains: async () => failures >= 0,
    };
    const stores = [
      { collection: 'bogle_users', doc: 'uid' as const },
      { collection: 'user_profiles', field: 'firebaseUid' },
    ];
    const keyed = [flaky, store('waitlist/{email}')];

    await expect(eraseUserRecord('u-1', db, stores, keyed)).rejects.toThrow('flaky');
    expect(docs.has('user_profiles/g1')).toBe(true);

    await eraseUserRecord('u-1', db, stores, keyed);
    expect(docs.has(waitlist)).toBe(false);
    expect(docs.has('user_profiles/g1')).toBe(false);
  });

  it("a retry reaches a linked phone profile's sponsored identities after its record is gone", async () => {
    getFirebaseUserOrThrow.mockResolvedValue({ providerData: [] });
    // An earlier attempt erased bogle_users/phone:+15550001111, then failed
    const { db, docs } = fakeFirestore({
      'bogle_users/u-1': { linkedIdentifiers: ['phone:+15550001111'] },
      'sponsored_identities/sid1': { sponsorUserId: 'phone:+15550001111' },
    });
    const stores = [
      { collection: 'bogle_users', doc: 'uid' as const },
      { collection: 'sponsored_identities', field: 'sponsorUserId' },
    ];
    await eraseUserRecord('u-1', db, stores, [store('waitlist/{email}')]);
    expect([...docs.keys()]).toEqual([]);
  });

  it("erases a linked phone profile's sponsored identities before its record", async () => {
    getFirebaseUserOrThrow.mockResolvedValue({ providerData: [] });
    const { db, raw, docs } = fakeFirestore({
      'bogle_users/u-1': { linkedIdentifiers: ['phone:+15550001111'] },
      'bogle_users/phone:+15550001111': {},
      'sponsored_identities/sid1': { sponsorUserId: 'phone:+15550001111' },
    });
    const erase = raw.recursiveDelete.getMockImplementation();
    raw.recursiveDelete.mockImplementation(async (ref: { path: string }) => {
      if (ref.path.startsWith('sponsored_identities/')) throw new Error('unavailable');
      await erase?.(ref);
    });
    const stores = [
      { collection: 'bogle_users', doc: 'uid' as const },
      { collection: 'sponsored_identities', field: 'sponsorUserId' },
    ];
    await expect(eraseUserRecord('u-1', db, stores, [store('waitlist/{email}')])).rejects.toThrow(
      'sponsored_identities[sponsorUserId]'
    );
    // Both records stay, so the retry finds the linked profile again
    expect(docs.has('bogle_users/phone:+15550001111')).toBe(true);
    expect(docs.has('bogle_users/u-1')).toBe(true);
  });
});
