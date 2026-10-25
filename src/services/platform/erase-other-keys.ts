/**
 * Stores that keep a person's data under a key other than their uid, which the
 * uid-keyed sweep in user-stores.ts can't find: the waitlist and access grants
 * (keyed by email), the phone index of the family members they sponsor, A/B test
 * assignments (one subcollection per test), the router's turn events (one partition
 * per day, semantic_router_events/{YYYY-MM-DD}/events), tool-call telemetry (many people's
 * calls in one shared document) and cohort membership (feature_cohorts.members, a
 * list of uids in each cohort document), and the minor-care hold on each of their
 * numbers (minor_care_holds/phone#<hash>). The keys, and why each can be trusted, are
 * in erasure-keys.ts.
 *
 * Not erased on purpose: feature_checkin_optouts/{phoneHash}. It is a STOP record for
 * a phone, kept so no one texts that number again (an on-behalf text from another
 * member checks it), and it holds an HMAC of the phone, not the person.
 *
 * @module services/platform/erase-other-keys
 */

import { chunks, emailDocId, type ErasureKeys } from './erasure-keys.js';
import { phoneHoldId } from '../outreach/checkin-replies.js';

export { emailDocId, gatherErasureKeys, type ErasureKeys } from './erasure-keys.js';

type Db = FirebaseFirestore.Firestore;
type DocRef = FirebaseFirestore.DocumentReference;

export interface KeyedStore {
  label: string;
  erase: (db: Db, keys: ErasureKeys) => Promise<void>;
  /** True while anything of the person's is left */
  remains: (db: Db, keys: ErasureKeys) => Promise<boolean>;
  /**
   * Set when gatherErasureKeys reads keys from this store: it is erased in that tier of
   * the user's key stores (erase-user-record.ts), after every store keyed by them.
   * Of these stores only the email-keyed access grants are read; the Stripe ids the
   * others hold are kept before anything is erased, so they need no tier.
   */
  keyTier?: number;
}

const PAGE = 300;

/** The uid and the phone profiles that are the same person */
const uidsOf = (keys: ErasureKeys): string[] => [keys.userId, ...keys.linkedUserIds];

/** A document per email: the waitlist place, and an access grant unless it names someone else */
function byEmail(collection: string, keyTier?: number): KeyedStore {
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
    keyTier,
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

/**
 * semantic_router_events/{day}/events: the router's record of each turn (routing-analytics.ts).
 * The day documents are never written, only listed; each day is queried by userId at once.
 */
const routerEventRefs = async (db: Db, keys: ErasureKeys): Promise<DocRef[]> => {
  const days = await db.collection('semantic_router_events').listDocuments();
  const snaps = await Promise.all(
    days.flatMap((day) =>
      chunks(uidsOf(keys)).map(async (ids) =>
        day.collection('events').where('userId', 'in', ids).get()
      )
    )
  );
  return snaps.flatMap((snap) => snap.docs.map((d) => d.ref));
};

type ToolCall = Record<string, unknown> & { userId?: unknown };

const CALLS = 'tool_usage_calls';
const BATCH_ID = /^batch_\d+$/;
const BATCH_PREFIX = 'batch_';
/** Sorts after every batch_{digits} id (':' follows '9') */
const BATCH_END = 'batch_:';
/** Holds lastUnmarked, the newest batch id seen without the noUserIds mark (no personal data) */
const META = { collection: 'analytics_meta', doc: 'tool_usage_calls' };

const names = (call: ToolCall | null | undefined, uids: readonly string[]): boolean =>
  typeof call?.userId === 'string' && uids.includes(call.userId);

const callsNaming = (calls: unknown, uids: readonly string[]): calls is ToolCall[] =>
  Array.isArray(calls) && calls.some((c: ToolCall) => names(c, uids));

/**
 * tool_usage_calls/{batch} holds many people's calls in one array, which can't be
 * queried by uid. tool-usage-analytics.ts stopped writing uids and marks every batch
 * since with noUserIds, so only unmarked batches can name anyone. Firestore can't
 * query for a missing field, so the newest unmarked batch seen is remembered, and two
 * counts check that nothing unmarked was written after it (an agent still on the old
 * writer during a rollout writes unmarked batches). Only then does the scan stop
 * there; otherwise everything is read and the mark moves. Once every writer is new,
 * each erasure reads the frozen set of old batches and no more.
 */
async function batchesNaming(db: Db, uids: readonly string[]): Promise<DocRef[]> {
  const meta = db.collection(META.collection).doc(META.doc);
  const seen: unknown = (await meta.get()).get('lastUnmarked');
  const known = typeof seen === 'string' ? seen : undefined;
  // Only the writer's batch_{ms} ids count: any other document can't move the mark
  const tail = db
    .collection(CALLS)
    .where('__name__', '>', known ?? BATCH_PREFIX)
    .where('__name__', '<', BATCH_END);
  const [all, marked] = await Promise.all([
    tail.count().get(),
    tail.where('noUserIds', '==', true).count().get(),
  ]);
  const wholeCollection = all.data().count > marked.data().count;
  if (!wholeCollection && !known) return [];

  const named: DocRef[] = [];
  let newest = known;
  let last: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    let query = db.collection(CALLS).orderBy('__name__');
    if (!wholeCollection && known) query = query.endAt(known);
    if (last) query = query.startAfter(last);
    const snap = await query.select('calls', 'noUserIds').limit(PAGE).get();
    for (const doc of snap.docs) {
      if (doc.get('noUserIds') === true) continue;
      // ascending, so the last unmarked batch read is the newest
      if (BATCH_ID.test(doc.id)) newest = doc.id;
      if (callsNaming(doc.get('calls'), uids)) named.push(doc.ref);
    }
    if (snap.size < PAGE) break;
    last = snap.docs[snap.docs.length - 1];
  }
  if (newest !== known) await meta.set({ lastUnmarked: newest }, { merge: true });
  return named;
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

/** feature_cohorts/{id}.members lists uids; a cohort naming the person loses them */
const cohortsNaming = async (db: Db, uids: readonly string[]): Promise<DocRef[]> => {
  const snaps = await Promise.all(
    chunks(uids).map(async (ids) =>
      db.collection('feature_cohorts').where('members', 'array-contains-any', ids).get()
    )
  );
  return [...new Map(snaps.flatMap((s) => s.docs.map((d) => [d.ref.path, d.ref]))).values()];
};

async function leaveCohorts(db: Db, uids: readonly string[]): Promise<void> {
  const refs = await cohortsNaming(db, uids);
  await Promise.all(
    refs.map(async (ref) =>
      db.runTransaction(async (tx) => {
        const members: unknown = (await tx.get(ref)).get('members');
        if (!Array.isArray(members)) return;
        tx.update(ref, { members: members.filter((m) => !uids.includes(m as string)) });
      })
    )
  );
}

/** MINOR_CARE_SHARED_HOLD: a held call's hold on each of the person's numbers (phone#<hash>) */
const phoneHoldRefs = (db: Db, keys: ErasureKeys): DocRef[] =>
  keys.phones
    .map((phone) => phoneHoldId(phone))
    .filter((id): id is string => !!id)
    .map((id) => db.collection('minor_care_holds').doc(id));

const deleteAll = async (db: Db, refs: DocRef[]): Promise<void> => {
  await Promise.all(refs.map(async (ref) => db.recursiveDelete(ref)));
};

export const KEYED_STORES: readonly KeyedStore[] = [
  byEmail('waitlist'),
  byEmail('user_profiles', 1), // a grant naming the uid is where the email is read from
  {
    label: 'sponsored_identity_phone_index[identityId]',
    erase: async (db, keys) => deleteAll(db, await phoneIndexRefs(db, keys)),
    remains: async (db, keys) => (await phoneIndexRefs(db, keys)).length > 0,
  },
  {
    label: 'minor_care_holds/{phone#hash}',
    erase: async (db, keys) => deleteAll(db, phoneHoldRefs(db, keys)),
    remains: async (db, keys) =>
      (await Promise.all(phoneHoldRefs(db, keys).map(async (r) => r.get()))).some((s) => s.exists),
  },
  {
    label: 'ab_tests/*/assignments/{uid}',
    erase: async (db, keys) => deleteAll(db, await assignmentRefs(db, keys)),
    remains: async (db, keys) => (await assignmentRefs(db, keys)).length > 0,
  },
  {
    label: 'semantic_router_events/*/events[userId]',
    erase: async (db, keys) => deleteAll(db, await routerEventRefs(db, keys)),
    remains: async (db, keys) => (await routerEventRefs(db, keys)).length > 0,
  },
  {
    label: 'feature_cohorts[members]',
    erase: async (db, keys) => leaveCohorts(db, uidsOf(keys)),
    remains: async (db, keys) => (await cohortsNaming(db, uidsOf(keys))).length > 0,
  },
  {
    label: 'tool_usage_calls[calls.userId]',
    erase: async (db, keys) => stripToolCalls(db, uidsOf(keys)),
    remains: async (db, keys) => (await batchesNaming(db, uidsOf(keys))).length > 0,
  },
];
