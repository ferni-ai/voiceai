import { beforeEach, describe, expect, it, vi } from 'vitest';

const getFirebaseUserOrThrow = vi.hoisted(() => vi.fn());
vi.mock('../../identity/firebase-auth.js', () => ({
  ensureFirebaseAdmin: () => false,
  getFirebaseUserOrThrow,
}));

import { emailDocId, KEYED_STORES } from '../erase-other-keys.js';
import { gatherErasureKeys, type ErasureKeys } from '../erasure-keys.js';
import { eraseUserRecord } from '../erase-user-record.js';

type Data = Record<string, unknown>;

/**
 * A Firestore holding documents by path with their fields: enough for the reads the
 * keyed stores make (doc reads, ==/in/array-contains-any queries, name-ordered pages,
 * listDocuments, transactions and recursive deletes). Records every page read.
 */
function fakeFirestore(seed: Record<string, Data>) {
  const docs = new Map(Object.entries(seed));
  const pagesRead: string[][] = [];
  const field = (data: Data | undefined, path: string): unknown =>
    path.split('.').reduce<unknown>((v, k) => (v as Data | undefined)?.[k], data);
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
    set: async (data: Data) => void docs.set(path, data),
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
            const value = field(docs.get(p), f);
            if (op === '==') return value === v;
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
    endBefore: (id: string) => query(name, filters, limit, from, id),
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

  it('strips the uid from calls in batches written before the change, in a transaction, reading no later batch', async () => {
    const { db, raw, docs, pagesRead } = fakeFirestore({
      'tool_usage_calls/batch_1700000000000': {
        calls: [
          { toolId: 'a', userId: 'u-1' },
          { toolId: 'b', userId: 'u-2' },
        ],
      },
      'tool_usage_calls/batch_1700000000001': { calls: [{ toolId: 'c', userId: 'u-2' }] },
      // The first marked batch; ids past it plus the rollout margin are never read
      'tool_usage_calls/batch_1800000000000': { calls: [{ toolId: 'd' }], noUserIds: true },
      'tool_usage_calls/batch_1900000000000': { calls: [{ toolId: 'e' }], noUserIds: true },
    });
    const calls = store('tool_usage_calls[calls.userId]');
    expect(await calls.remains(db, keysFor())).toBe(true);
    await calls.erase(db, keysFor());

    expect(docs.get('tool_usage_calls/batch_1700000000000')?.['calls']).toEqual([
      { toolId: 'a' },
      { toolId: 'b', userId: 'u-2' },
    ]);
    expect(raw.runTransaction).toHaveBeenCalledTimes(1);
    expect(await calls.remains(db, keysFor())).toBe(false);
    expect(pagesRead.flat()).not.toContain('batch_1900000000000');
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
  });

  it('a phone profile that linked another sign-in is not erased, even on the verified number', async () => {
    getFirebaseUserOrThrow.mockResolvedValue({ phoneNumber: '+15550000009', providerData: [] });
    const { db } = fakeFirestore({
      'bogle_users/phone:+15550000009': { linkedIdentifiers: ['auth:default:u-2'] },
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
});
