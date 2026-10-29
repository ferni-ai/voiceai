/**
 * Reads of bogle_users/{uid}/facts; the memory writer is the only writer. Member facts
 * only, nothing while MEMORY_FACTS is off, never a forgotten fact, ids in logs only.
 *
 * @module memory/facts/facts-store
 */
import type { DocumentReference, Firestore, Query } from '@google-cloud/firestore';
import { memoryFactsEnabled } from '../../config/memory-facts-flag.js';
import type { Env } from '../../config/env-flag.js';
import { isMemberIdentity } from '../../services/identity/member-identity.js';
import { createLogger } from '../../utils/safe-logger.js';
import { factText, isForgotten, parseTopics } from '../recall/forget.js';
import { toFact, type Fact, type FactAttribute } from './fact.js';

const log = createLogger({ module: 'facts-store' });
const UID = /^[\w:.@+-]{1,200}$/;
/** True for a member's own facts; throws on an id that would address another path. */
export const memberFacts = (uid: string): boolean => {
  if (!UID.test(uid)) throw new Error('facts: refusing an invalid user id');
  return isMemberIdentity(uid);
};
const FACT_ID = /^[\w-]{1,200}$/;
/** Throws on an id that would address another path (a nested doc, say). */
export const factDoc = (db: Firestore, uid: string, id: string): DocumentReference => {
  if (!FACT_ID.test(id)) throw new Error('facts: refusing an invalid fact id');
  return db.collection('bogle_users').doc(uid).collection('facts').doc(id);
};

/** A person's facts by subject and attribute; two equality filters need no index. */
export function factsQuery(
  db: Firestore,
  uid: string,
  subjectId?: string,
  attribute?: FactAttribute
): Query {
  let q = db.collection('bogle_users').doc(uid).collection('facts') as Query;
  if (subjectId) q = q.where('subjectId', '==', subjectId);
  if (attribute) q = q.where('attribute', '==', attribute);
  return q.limit(500);
}

/** The facts this build wrote; any other shape is skipped and logged by id. */
export function parseFacts(
  uid: string,
  docs: ReadonlyArray<{ id: string; data: () => unknown }>
): Fact[] {
  return docs.flatMap((d) => {
    const f = toFact(d.id, d.data());
    if (!f) log.warn({ uid, factId: d.id }, 'Skipped an unreadable fact');
    return f ? [f] : [];
  });
}

export const isCurrent = (f: Fact): boolean =>
  f.validTo === null && f.retiredAt === null && f.forgottenAt === null;
const ms = (iso: string): number => Date.parse(iso);

/** The topics the owner asked to forget; null when they can't be read, so readers fail closed. */
async function forgottenWords(db: Firestore, uid: string): Promise<string[] | null> {
  const doc = db.collection('bogle_users').doc(uid).collection('memory_state').doc('forgotten');
  const snap = await doc.get();
  return parseTopics(snap.exists ? snap.data()?.topics : undefined);
}

/** Matching facts that pass `keep`, newest learned first; none forgotten or about a forgotten topic. */
async function read(
  db: Firestore,
  uid: string,
  env: Env,
  keep: (f: Fact) => boolean,
  subjectId?: string,
  attribute?: FactAttribute
): Promise<Fact[]> {
  if (!memoryFactsEnabled(env) || !memberFacts(uid)) return [];
  const topics = await forgottenWords(db, uid);
  if (!topics) return [];
  const snap = await factsQuery(db, uid, subjectId, attribute).get();
  return parseFacts(uid, snap.docs)
    .filter(
      (f) =>
        f.forgottenAt === null &&
        keep(f) &&
        !isForgotten(factText({ attribute: f.attribute, value: f.value }), topics)
    )
    .sort((a, b) => ms(b.learnedAt) - ms(a.learnedAt));
}

/** What is true now: not ended, not retired, not forgotten. */
export const getCurrentFacts = (
  db: Firestore,
  uid: string,
  subjectId?: string,
  attribute?: FactAttribute,
  env: Env = process.env
): Promise<Fact[]> => read(db, uid, env, isCurrent, subjectId, attribute);

/** What was true at `asOf`, replaced facts included; no validFrom means true before it was learned. */
export const getFactsAsOf = (
  db: Firestore,
  uid: string,
  subjectId: string,
  attribute: FactAttribute,
  asOf: Date,
  env: Env = process.env
): Promise<Fact[]> =>
  read(
    db,
    uid,
    env,
    (f) =>
      (f.validFrom === null || ms(f.validFrom) <= asOf.getTime()) &&
      (f.validTo === null || ms(f.validTo) > asOf.getTime()),
    subjectId,
    attribute
  );

/** Every fact about one subject and attribute, replaced ones included, oldest learned first. */
export async function listFactHistory(
  db: Firestore,
  uid: string,
  subjectId: string,
  attribute: FactAttribute,
  env: Env = process.env
): Promise<Fact[]> {
  return (await read(db, uid, env, () => true, subjectId, attribute)).reverse();
}
