/**
 * Account erasure removes the member's consent grants (consent/{phoneHash}.grants.{uid},
 * messaging/consent-grants.ts) and nothing else of the contact's record: another
 * member's grant on the same contact, and the contact's own STOP, stay.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../identity/firebase-auth.js', () => ({ ensureFirebaseAdmin: () => false }));
vi.mock('../../outreach/outreach-intelligence.js', () => ({
  eraseUserOutreachData: vi.fn(async () => undefined),
}));
const logged = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }));
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/safe-logger.js')>()),
  createLogger: () => ({ ...logged, child: () => logged }),
}));

import { eraseUserRecord, findUserRecordRemnants } from '../erase-user-record.js';
import { ENTRIES_IN_OTHERS_DOCS, ERASED_STORES, storeLabel } from '../user-stores.js';

type Data = Record<string, unknown>;
const LABEL = 'consent[grants.{uid}]';
const GRANT = { sms: { source: 'owner-attested', at: '2026-10-20T00:00:00.000Z' } };

/** Documents by path: != null queries on a dotted path, transactions, updates */
function fakeFirestore(seed: Record<string, Data>) {
  const docs = new Map(Object.entries(seed));
  const at = (data: Data | undefined, path: string): unknown =>
    path.split('.').reduce<unknown>((v, k) => (v as Data | undefined)?.[k], data);
  const ref = (path: string) => ({ path });
  const query = (name: string, path: string, op: string, limit = Infinity) => ({
    limit: (n: number) => query(name, path, op, n),
    get: async () => {
      if (op !== '!=') throw new Error(`op ${op}`);
      const hits = [...docs.keys()]
        .filter((p) => p.startsWith(`${name}/`) && at(docs.get(p), path) != null)
        .slice(0, limit);
      return { empty: hits.length === 0, docs: hits.map((p) => ({ ref: ref(p) })) };
    },
  });
  const db = {
    collection: (name: string) => ({
      where: (path: string, op: string) => query(name, path, op),
    }),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: async (r: { path: string }) => ({ get: (f: string) => at(docs.get(r.path), f) }),
        update: (r: { path: string }, d: Data) =>
          void docs.set(r.path, { ...docs.get(r.path), ...d }),
      }),
  };
  return { db: db as unknown as FirebaseFirestore.Firestore, docs };
}

const seeded = () =>
  fakeFirestore({
    // Mom: texted for both owners, and she said STOP to calls
    'consent/hash-mom': {
      call: { state: 'opted-out', source: 'reply:stop calling' },
      grants: { 'owner-a': GRANT, 'owner-b': GRANT },
      history: ['2026-10-20T00:00:00.000Z sms grant owner-attested'],
    },
    'consent/hash-pal': { grants: { 'owner-a': GRANT } },
    'consent/hash-stranger': { sms: { state: 'opted-out', source: 'reply:STOP' } },
  });

describe('account erasure: consent grants', () => {
  it('is in the erasure catalog', () => {
    expect(ERASED_STORES.map(storeLabel)).toContain(LABEL);
  });

  it("removes owner A's grants; owner B's grant and the contact's STOP stay", async () => {
    const { db, docs } = seeded();
    expect(await findUserRecordRemnants(db, 'owner-a', ENTRIES_IN_OTHERS_DOCS)).toEqual([LABEL]);

    await eraseUserRecord('owner-a', db, ENTRIES_IN_OTHERS_DOCS, []);

    expect(await findUserRecordRemnants(db, 'owner-a', ENTRIES_IN_OTHERS_DOCS)).toEqual([]);
    expect(docs.get('consent/hash-mom')).toEqual({
      call: { state: 'opted-out', source: 'reply:stop calling' },
      grants: { 'owner-b': GRANT },
      history: ['2026-10-20T00:00:00.000Z sms grant owner-attested'],
    });
    expect(docs.get('consent/hash-pal')).toEqual({ grants: {} });
    expect(docs.get('consent/hash-stranger')).toEqual({
      sms: { state: 'opted-out', source: 'reply:STOP' },
    });
    expect(await findUserRecordRemnants(db, 'owner-b', ENTRIES_IN_OTHERS_DOCS)).toEqual([LABEL]);
  });

  it('refuses a uid that would address a deeper key, logging the error code only', async () => {
    const { db, docs } = seeded();
    const before = structuredClone([...docs.entries()]);
    await expect(eraseUserRecord('owner.a', db, ENTRIES_IN_OTHERS_DOCS, [])).rejects.toThrow(
      `User record not fully erased: ${LABEL}`
    );
    expect([...docs.entries()]).toEqual(before);
    const [fields] = logged.warn.mock.calls.find((c) => c[1] === 'Store not erased') ?? [];
    expect(Object.keys(fields as Data).sort()).toEqual(['error', 'store', 'userId']);
    expect((fields as Data).error).toBe('Error'); // the code, not the message
  });
});
