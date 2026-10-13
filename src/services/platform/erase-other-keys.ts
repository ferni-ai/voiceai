/**
 * Stores that keep a person's data under a key other than their uid, which the
 * uid-keyed sweep in user-stores.ts can't find: the waitlist and access grants
 * (keyed by email), the phone index of the family members they sponsor, A/B test
 * assignments (one subcollection per test) and tool-call telemetry (many people's
 * calls in one shared document).
 *
 * The email comes from the person's Firebase record at deletion time, and only when
 * Firebase has verified it: an unverified address could be anyone's, and deleting by
 * it would erase another person's waitlist place or access grant.
 *
 * Not erased on purpose: feature_checkin_optouts/{phoneHash}. It is a STOP record for
 * a phone, kept so no one texts that number again (an on-behalf text from another
 * member checks it), and it holds an HMAC of the phone, not the person.
 *
 * @module services/platform/erase-other-keys
 */

import { getFirebaseUser } from '../identity/firebase-auth.js';

type Db = FirebaseFirestore.Firestore;
type DocRef = FirebaseFirestore.DocumentReference;

export interface ErasureKeys {
  userId: string;
  /** Verified email addresses, lower-cased as the writers store them */
  emails: string[];
  /** sponsored_identities the person sponsors; their phone index entries go with them */
  sponsoredIdentityIds: string[];
}

export interface KeyedStore {
  label: string;
  erase: (db: Db, keys: ErasureKeys) => Promise<void>;
  /** True while anything of the person's is left */
  remains: (db: Db, keys: ErasureKeys) => Promise<boolean>;
}

/** The document id the waitlist and user_profiles writers derive from an email (waitlist-routes.ts) */
export const emailDocId = (email: string): string =>
  Buffer.from(email).toString('base64').replace(/[/+=]/g, '_');

const PAGE = 300;
/** Firestore's limit on the values of an 'in' query */
const IN_LIMIT = 30;

/** Read before anything is erased: the sponsored identities are erased by the sweep */
export async function gatherErasureKeys(db: Db, userId: string): Promise<ErasureKeys> {
  const user = await getFirebaseUser(userId);
  const email = user?.emailVerified === true ? user.email?.toLowerCase().trim() : undefined;
  const sponsored = await db
    .collection('sponsored_identities')
    .where('sponsorUserId', '==', userId)
    .get();
  return {
    userId,
    emails: email ? [email] : [],
    sponsoredIdentityIds: sponsored.docs.map((d) => d.id),
  };
}

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
  const chunks: string[][] = [];
  for (let i = 0; i < keys.sponsoredIdentityIds.length; i += IN_LIMIT) {
    chunks.push(keys.sponsoredIdentityIds.slice(i, i + IN_LIMIT));
  }
  const snaps = await Promise.all(
    chunks.map(async (ids) =>
      db.collection('sponsored_identity_phone_index').where('identityId', 'in', ids).get()
    )
  );
  return snaps.flatMap((snap) => snap.docs.map((d) => d.ref));
};

/** ab_tests/{test}/assignments/{uid}: a handful of tests, each looked up by id */
const assignmentRefs = async (db: Db, keys: ErasureKeys): Promise<DocRef[]> => {
  const tests = await db.collection('ab_tests').listDocuments();
  const refs = tests.map((test) => test.collection('assignments').doc(keys.userId));
  const snaps = await Promise.all(refs.map(async (ref) => ref.get()));
  return snaps.filter((snap) => snap.exists).map((snap) => snap.ref);
};

interface ToolCall {
  userId?: unknown;
}

/**
 * tool_usage_calls/{batch} holds many people's calls in one array, and the array
 * can't be queried by uid, so every batch is read. The person's calls lose their
 * userId; everyone else's are left as they are. Returns how many batches named them.
 */
async function stripToolCalls(db: Db, userId: string, write: boolean): Promise<number> {
  let named = 0;
  let last: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    const base = db.collection('tool_usage_calls').orderBy('__name__').limit(PAGE);
    const snap = await (last ? base.startAfter(last) : base).get();
    if (snap.empty) return named;
    last = snap.docs[snap.docs.length - 1];
    for (const doc of snap.docs) {
      const calls: unknown = doc.get('calls');
      if (!Array.isArray(calls) || !calls.some((c: ToolCall) => c?.userId === userId)) continue;
      named++;
      if (!write) continue;
      const kept = calls.map((c: ToolCall & Record<string, unknown>) => {
        if (c?.userId !== userId) return c;
        const { userId: _dropped, ...rest } = c;
        return rest;
      });
      await doc.ref.update({ calls: kept });
    }
  }
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
    erase: async (db, keys) => {
      await stripToolCalls(db, keys.userId, true);
    },
    remains: async (db, keys) => (await stripToolCalls(db, keys.userId, false)) > 0,
  },
];
