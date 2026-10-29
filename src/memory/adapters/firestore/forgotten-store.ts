/**
 * bogle_users/{uid}/memory_state/forgotten: the one writer of the caller's
 * forgotten topics and the reader behind the ForgottenStore port
 * (ports/forgotten-store.ts). Not yet moved here: the nightly pondering pass's
 * own reads (intelligence/pondering/ponder-job.ts, ponder-user.ts).
 *
 * - A call start reads it once: while the call-start window is open
 *   (utils/call-start-reads.ts) every reader shares one read, and a forget
 *   written in this process drops the shared read so the next one is fresh.
 * - `generation` is stored with the topics and goes up by one in the same
 *   transaction as each forget, so it survives a restart and is seen by
 *   every process. This process keeps only the highest stored generation it
 *   has read or written (forgetGenerationSeen), for caches that can't wait
 *   for a read to compare against.
 *
 * @module memory/adapters/firestore/forgotten-store
 */
import type { Firestore } from '@google-cloud/firestore';
import { dropCallStartRead, readOncePerCallStart } from '../../../utils/call-start-reads.js';
import type { ForgottenState, ForgottenStore } from '../../ports/forgotten-store.js';

const forgottenDoc = (db: Firestore, userId: string) =>
  db.collection('bogle_users').doc(userId).collection('memory_state').doc('forgotten');
const sharedKey = (userId: string): string => `forgotten:${userId}`;

/**
 * The stored topics field: none recorded is [], anything else that isn't a
 * list of strings is unreadable (null), so readers fail closed.
 */
export function parseTopics(raw: unknown): string[] | null {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || !raw.every((t) => typeof t === 'string')) return null;
  return raw;
}

/** The stored generation; 0 when absent (written before it was kept) or malformed. */
function parseGeneration(raw: unknown): number {
  return typeof raw === 'number' && Number.isSafeInteger(raw) && raw > 0 ? raw : 0;
}

const generations = new Map<string, number>();
function noteGeneration(userId: string, generation: number): void {
  if (generation > (generations.get(userId) ?? 0)) generations.set(userId, generation);
}

/** The highest stored generation this process has read or written for the caller; 0 before any. */
export function forgetGenerationSeen(userId: string): number {
  return generations.get(userId) ?? 0;
}

/**
 * A forget whose store keeps no generation (a test double): this process
 * counts it on top of the highest stored one, so its caches still refresh.
 */
export function noteUnstoredForget(userId: string): void {
  generations.set(userId, forgetGenerationSeen(userId) + 1);
}

async function readState(db: Firestore, userId: string): Promise<ForgottenState> {
  const snap = await forgottenDoc(db, userId).get();
  const data = snap.exists ? snap.data() : undefined;
  return { topics: parseTopics(data?.topics), generation: parseGeneration(data?.generation) };
}

/** The port over `db` (getFirestoreDb()); with no database the topics are unreadable. */
export function firestoreForgottenStore(db: Firestore | null | undefined): ForgottenStore {
  return {
    async readForgotten(userId) {
      if (!db) return { topics: null, generation: 0 };
      const state = await readOncePerCallStart(sharedKey(userId), () => readState(db, userId));
      noteGeneration(userId, state.generation);
      // Each reader gets its own list, so none can change another's.
      return { topics: state.topics && [...state.topics], generation: state.generation };
    },
  };
}

/**
 * Records a forgotten topic (as stored) and what was asked, and raises the
 * generation by one, in one transaction; returns the new generation. A
 * forget of a topic already recorded still raises it: the facts it marks
 * are new. Readers in this process see it at once.
 */
export async function addForgottenTopic(
  db: Firestore,
  userId: string,
  topic: string,
  asked?: string
): Promise<number> {
  const ref = forgottenDoc(db, userId);
  const generation = await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const topics: unknown = doc.exists ? doc.data()?.topics : [];
    const list = Array.isArray(topics) ? topics.map(String) : [];
    // What was asked is kept too, so a later tokenizer can re-derive the topic.
    const rawAsked: unknown = doc.exists ? doc.data()?.asked : [];
    const askedList = Array.isArray(rawAsked) ? rawAsked.map(String) : [];
    const nextAsked = asked && !askedList.includes(asked) ? [...askedList, asked] : askedList;
    const next = parseGeneration(doc.exists ? doc.data()?.generation : undefined) + 1;
    tx.set(
      ref,
      {
        topics: list.includes(topic) ? list : [...list, topic],
        asked: nextAsked,
        generation: next,
      },
      { merge: true }
    );
    return next;
  });
  dropCallStartRead(sharedKey(userId));
  noteGeneration(userId, generation);
  return generation;
}
