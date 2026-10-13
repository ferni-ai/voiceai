/**
 * Stores that keep a person's data under a key other than their uid, which the
 * uid-keyed sweep in user-stores.ts can't find: the waitlist and access grants
 * (keyed by email), the phone index of the family members they sponsor, A/B test
 * assignments (one subcollection per test) and tool-call telemetry (many people's
 * calls in one shared document). The keys, and why each can be trusted, are in
 * erasure-keys.ts.
 *
 * Not erased on purpose: feature_checkin_optouts/{phoneHash}. It is a STOP record for
 * a phone, kept so no one texts that number again (an on-behalf text from another
 * member checks it), and it holds an HMAC of the phone, not the person.
 *
 * @module services/platform/erase-other-keys
 */

import { chunks, emailDocId, type ErasureKeys } from './erasure-keys.js';

export { emailDocId, gatherErasureKeys, type ErasureKeys } from './erasure-keys.js';

type Db = FirebaseFirestore.Firestore;
type DocRef = FirebaseFirestore.DocumentReference;

export interface KeyedStore {
  label: string;
  erase: (db: Db, keys: ErasureKeys) => Promise<void>;
  /** True while anything of the person's is left */
  remains: (db: Db, keys: ErasureKeys) => Promise<boolean>;
}

const PAGE = 300;

/** The uid and the phone profiles that are the same person */
const uidsOf = (keys: ErasureKeys): string[] => [keys.userId, ...keys.linkedUserIds];

/** A document per email: the waitlist place, and an access grant unless it names someone else */
function byEmail(collection: string): KeyedStore {
  const refs = async (db: Db, keys: ErasureKeys): Promise<DocRef[]> => {
    const all = keys.emails.map((email) => db.collection(collection).doc(emailDocId(email)));
    const snaps = await Promise.all(all.map(async (ref) => ref.get()));
    return snaps
      .filter((snap) => snap.exists)
      .filter((snap) => {
        const owner: unknown = snap.get('firebaseUid');
        return owner === undefined || owner === null || owner === keys.userId;
      })
      .map((snap) => snap.ref);
  };
  return {
    label: `${collection}/{email}`,
    erase: async (db, keys) => {
      await Promise.all((await refs(db, keys)).map(async (ref) => db.recursiveDelete(ref)));
    },
    remains: async (db, keys) => (await refs(db, keys)).length > 0,
  };
}

const phoneIndexRefs = async (db: Db, keys: ErasureKeys): Promise<DocRef[]> => {
  const snaps = await Promise.all(
    chunks(keys.sponsoredIdentityIds).map(async (ids) =>
      db.collection('sponsored_identity_phone_index').where('identityId', 'in', ids).get()
    )
  );
  return snaps.flatMap((snap) => snap.docs.map((d) => d.ref));
};

/** ab_tests/{test}/assignments/{uid}: a handful of tests, each looked up by id */
const assignmentRefs = async (db: Db, keys: ErasureKeys): Promise<DocRef[]> => {
  const tests = await db.collection('ab_tests').listDocuments();
  const refs = tests.flatMap((test) =>
    uidsOf(keys).map((uid) => test.collection('assignments').doc(uid))
  );
  const snaps = await Promise.all(refs.map(async (ref) => ref.get()));
  return snaps.filter((snap) => snap.exists).map((snap) => snap.ref);
};

type ToolCall = Record<string, unknown> & { userId?: unknown };

const CALLS = 'tool_usage_calls';
/** Instances still running the old writer during a rollout keep writing uids for a while */
const ROLLOUT_MARGIN_MS = 24 * 60 * 60 * 1000;

const names = (call: ToolCall | null | undefined, uids: readonly string[]): boolean =>
  typeof call?.userId === 'string' && uids.includes(call.userId);

const callsNaming = (calls: unknown, uids: readonly string[]): calls is ToolCall[] =>
  Array.isArray(calls) && calls.some((c: ToolCall) => names(c, uids));

/**
 * The batch id past which no batch holds a uid. tool-usage-analytics.ts stopped writing
 * uids and marks every batch since with noUserIds; batch ids are batch_{epoch ms}, so
 * id order is time order. Undefined (scan everything) until the first marked batch.
 */
async function legacyEnd(db: Db): Promise<string | undefined> {
  const first = await db
    .collection(CALLS)
    .where('noUserIds', '==', true)
    .orderBy('__name__')
    .limit(1)
    .get();
  const id = first.docs[0]?.id;
  const ms = Number(/^batch_(\d+)$/.exec(id ?? '')?.[1]);
  if (!id) return undefined;
  return Number.isFinite(ms) ? `batch_${ms + ROLLOUT_MARGIN_MS}` : id;
}

/**
 * tool_usage_calls/{batch} holds many people's calls in one array, which can't be
 * queried by uid. Only batches written before calls lost their uid can name anyone,
 * so only those are read: a set that stops growing once the change is deployed.
 */
async function batchesNaming(db: Db, uids: readonly string[]): Promise<DocRef[]> {
  const end = await legacyEnd(db);
  const named: DocRef[] = [];
  let last: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    let query = db.collection(CALLS).orderBy('__name__');
    if (end) query = query.endBefore(end);
    if (last) query = query.startAfter(last);
    const snap = await query.select('calls').limit(PAGE).get();
    named.push(...snap.docs.filter((d) => callsNaming(d.get('calls'), uids)).map((d) => d.ref));
    if (snap.size < PAGE) return named;
    last = snap.docs[snap.docs.length - 1];
  }
}

/**
 * The person's calls lose their userId; everyone else's are left as they are. In a
 * transaction, so two erasures stripping one batch can't write back each other's uids.
 */
async function stripToolCalls(db: Db, uids: readonly string[]): Promise<void> {
  const refs = await batchesNaming(db, uids);
  await Promise.all(
    refs.map(async (ref) =>
      db.runTransaction(async (tx) => {
        const calls: unknown = (await tx.get(ref)).get('calls');
        if (!callsNaming(calls, uids)) return;
        const kept = calls.map((c) => {
          if (!names(c, uids)) return c;
          const { userId: _dropped, ...rest } = c;
          return rest;
        });
        tx.update(ref, { calls: kept });
      })
    )
  );
}

const deleteAll = async (db: Db, refs: DocRef[]): Promise<void> => {
  await Promise.all(refs.map(async (ref) => db.recursiveDelete(ref)));
};

export const KEYED_STORES: readonly KeyedStore[] = [
  byEmail('waitlist'),
  byEmail('user_profiles'),
  {
    label: 'sponsored_identity_phone_index[identityId]',
    erase: async (db, keys) => deleteAll(db, await phoneIndexRefs(db, keys)),
    remains: async (db, keys) => (await phoneIndexRefs(db, keys)).length > 0,
  },
  {
    label: 'ab_tests/*/assignments/{uid}',
    erase: async (db, keys) => deleteAll(db, await assignmentRefs(db, keys)),
    remains: async (db, keys) => (await assignmentRefs(db, keys)).length > 0,
  },
  {
    label: 'tool_usage_calls[calls.userId]',
    erase: async (db, keys) => stripToolCalls(db, uidsOf(keys)),
    remains: async (db, keys) => (await batchesNaming(db, uidsOf(keys))).length > 0,
  },
];
