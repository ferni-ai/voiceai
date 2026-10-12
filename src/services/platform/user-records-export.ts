/**
 * "Take your story": the records the app and the voice agent keep for a person, read as
 * they are stored, so the export carries every one (menu rubric §6, "Leaves with them").
 *
 * The curated export categories (Conversations, Contacts, Productivity, ...) read their
 * own stores, and several panels read stores none of them touched: the calendar, the
 * voice agent's calls and summaries, shared memories, outreach, routines, seeds. Rather
 * than add a category per store, everything under a person's two records is exported:
 * bogle_users/{uid}/* (the voice agent) and users/{uid}/* (the app), plus the few
 * stores kept elsewhere and keyed by the person. KNOWN_USER_STORES below is the list a
 * test holds the export to; a new store under either record is exported without a change.
 *
 * @module services/platform/user-records-export
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';

/** Collections whose {uid} document, and everything under it, belongs to that person */
export const USER_RECORD_ROOTS = ['bogle_users', 'users'] as const;

/** Stores outside those records: a document keyed by the uid, or documents naming it */
export const OWNED_ELSEWHERE: ReadonlyArray<
  { collection: string; doc: 'uid' } | { collection: string; field: string }
> = [
  { collection: 'user_seeds', doc: 'uid' }, // seed balance and history (Seeds card)
  { collection: 'engagement_profiles', doc: 'uid' }, // the profile doc; its subcollections too
  { collection: 'households', doc: 'uid' },
  { collection: 'contact_relationships', field: 'userId' }, // People You've Told Me About
  { collection: 'contact_interactions', field: 'userId' },
  { collection: 'sponsored_identities', field: 'sponsorUserId' }, // Family Phone Access
];

/**
 * Never exported, though stored under the person: sign-in credentials, which would put
 * a live token in a file people share, and caches rebuilt from the stores above.
 */
export const NOT_EXPORTED = /token|secret|credential|oauth|_cache$/i;
/** The same for a field inside an exported document (a push token, a stored password hash) */
const SECRET_FIELD = /token|secret|credential|password|oauth|api_?key/i;

/**
 * Stores a menu panel reads or the voice agent writes (menu audit 2026-10-12). The
 * export must carry each one; menu-export.emulator.test.ts fails when it doesn't.
 */
export const KNOWN_USER_STORES: readonly string[] = [
  'bogle_users/{uid}/conversations', // every call (When We've Talked shows only web calls)
  'bogle_users/{uid}/summaries', // call summaries (This Year Together)
  'bogle_users/{uid}/outreach_attempts', // When I'll Reach Out
  'bogle_users/{uid}/relationship_arc', // Our Story So Far
  'bogle_users/{uid}/emotional_arcs',
  'bogle_users/{uid}/trust_profiles', // Trust & Growth (the category exports only counts)
  'bogle_users/{uid}/memory_highlights', // Memory Lane
  'bogle_users/{uid}/saved_rituals', // Build a Ritual
  'bogle_users/{uid}/journal',
  'bogle_users/{uid}/team_insights', // Team Insights
  'bogle_users/{uid}/voice_profile', // Recognizing You
  'bogle_users/{uid}/wellbeing_snapshots', // How You're Feeling
  'users/{uid}/calendar_events', // What's Ahead
  'users/{uid}/life_automation', // What I Do For You
  'users/{uid}/shared_memories',
  'users/{uid}/journal',
  'users/{uid}/practices',
  'user_seeds/{uid}',
  'engagement_profiles/{uid}',
  'contact_relationships',
];

const MAX_DOCS_PER_COLLECTION = 10_000;

type Db = FirebaseFirestore.Firestore;
type Plain = string | number | boolean | null | Plain[] | { [key: string]: Plain };

/** Firestore values as JSON: timestamps become ISO strings, references their paths */
function toPlain(value: unknown): Plain {
  if (value === null || value === undefined) return null;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toPlain);
  if (typeof value === 'object') {
    const path = (value as { path?: unknown; firestore?: unknown }).firestore
      ? (value as { path?: unknown }).path
      : undefined;
    if (typeof path === 'string') return path;
    const fields = Object.entries(value).filter(([k]) => !SECRET_FIELD.test(k));
    return Object.fromEntries(fields.map(([k, v]) => [k, toPlain(v)]));
  }
  return value as string | number | boolean;
}

interface StoreReader {
  doc(label: string, ref: FirebaseFirestore.DocumentReference): Promise<void>;
  query(label: string, query: FirebaseFirestore.Query): Promise<void>;
}

/** Visit each store kept for the person; labels are paths with the uid written as {uid} */
async function eachStore(db: Db, userId: string, read: StoreReader): Promise<void> {
  const tree = async (ref: FirebaseFirestore.DocumentReference, label: string): Promise<void> => {
    await read.doc(label, ref);
    for (const sub of await ref.listCollections()) {
      if (!NOT_EXPORTED.test(sub.id)) await read.query(`${label}/${sub.id}`, sub);
    }
  };
  for (const root of USER_RECORD_ROOTS)
    await tree(db.collection(root).doc(userId), `${root}/{uid}`);
  for (const store of OWNED_ELSEWHERE) {
    const collection = db.collection(store.collection);
    if ('doc' in store) await tree(collection.doc(userId), `${store.collection}/{uid}`);
    else await read.query(store.collection, collection.where(store.field, '==', userId));
  }
}

/**
 * Every record kept for this person, as stored. Keys are store paths
 * ("users/{uid}/calendar_events"), values the documents with their ids.
 */
export async function exportUserRecords(
  userId: string,
  firestore?: Db
): Promise<Record<string, Plain>> {
  const out: Record<string, Plain> = {};
  await eachStore(await openFor(userId, firestore), userId, {
    doc: async (label, ref) => {
      const snap = await ref.get();
      if (snap.exists) out[label] = toPlain(snap.data());
    },
    query: async (label, query) => {
      const snap = await query.limit(MAX_DOCS_PER_COLLECTION).get();
      const rows = snap.docs.map((d) => ({
        id: d.id,
        ...(toPlain(d.data()) as Record<string, Plain>),
      }));
      if (rows.length > 0) out[label] = rows;
    },
  });
  return out;
}

/** How many documents the export would hold, for the category list (counts, no reads) */
export async function countUserRecords(userId: string, firestore?: Db): Promise<number> {
  let count = 0;
  await eachStore(await openFor(userId, firestore), userId, {
    doc: async (_label, ref) => {
      if ((await ref.get()).exists) count += 1;
    },
    query: async (_label, query) => {
      count += (await query.count().get()).data().count;
    },
  });
  return count;
}

/** The person's id checked (one document, no '/'), and the database to read */
async function openFor(userId: string, firestore?: Db): Promise<Db> {
  const { assertErasableUserId } = await import('./erase-user-record.js');
  assertErasableUserId(userId);
  if (firestore) return firestore;
  const { ensureFirebaseAdmin } = await import('../identity/firebase-auth.js');
  if (!ensureFirebaseAdmin()) throw new Error('Firebase Admin is not initialized');
  return getFirestore();
}
