/**
 * What the caller asked to forget never comes back through vector search.
 *
 * Every reader of the `vectors` index (the recallFromMemory tools, per-turn
 * memory search, the rag and graph context builders, past-conversation
 * search) went through FirestoreVectorStore with no forget check, and the
 * index holds copies written by many writers: facts, call summaries,
 * remembered facts, journal entries, habits and goals. Filtering at each
 * reader missed some; this filters once, in the store, for every search with
 * an owner.
 *
 * A result is dropped when its text is about a forgotten topic (the shared
 * matcher, isForgotten), or when it is a copy of a fact that is now forgotten
 * or deleted: an indexed dynamic fact by its id (conversation_fact_<id>,
 * fact_fact_<uid>_<id>), any other copy by the source it records
 * (metadata.sourceCollection / sourceDocId). If the forgotten topics or the
 * source docs can't be read, the affected results are dropped (fails closed).
 *
 * @module memory/firestore-vector-store/forget-filter
 */
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { isForgotten } from '../recall/session-recall.js';

/** Topics change rarely; a short cache keeps search from paying a read every time. */
const TOPICS_TTL_MS = 15_000;
const topicsCache = new Map<string, { at: number; topics: string[] }>();

/** For tests, and for a forget in this process to count at once. */
export function clearForgottenTopicsCache(userId?: string): void {
  if (userId) topicsCache.delete(userId);
  else topicsCache.clear();
}

/** None recorded is []; anything but a list of strings is unreadable (null). */
export function parseForgottenTopics(raw: unknown): string[] | null {
  if (raw === undefined || raw === null) return [];
  return Array.isArray(raw) && raw.every((t) => typeof t === 'string') ? raw : null;
}

export interface ForgetReads {
  topics: (userId: string) => Promise<unknown>;
  /** Source docs by path; a missing doc maps to undefined. */
  docs: (paths: string[]) => Promise<Map<string, Record<string, unknown> | undefined>>;
}

const firestoreReads: ForgetReads = {
  async topics(userId) {
    const db = getFirestoreDb();
    if (!db) throw new Error('Firestore not available');
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('memory_state')
      .doc('forgotten')
      .get();
    return doc.exists ? doc.data()?.topics : undefined;
  },
  async docs(paths) {
    const db = getFirestoreDb();
    if (!db) throw new Error('Firestore not available');
    const snaps = await db.getAll(...paths.map((p) => db.doc(p)));
    return new Map(snaps.map((s, i) => [paths[i]!, s.exists ? s.data() : undefined]));
  },
};

async function topicsFor(
  userId: string,
  reads: ForgetReads,
  now: number
): Promise<string[] | null> {
  const hit = topicsCache.get(userId);
  if (hit && now - hit.at < TOPICS_TTL_MS) return hit.topics;
  try {
    const topics = parseForgottenTopics(await reads.topics(userId));
    if (topics) topicsCache.set(userId, { at: now, topics });
    return topics;
  } catch {
    return null;
  }
}

/** The stored source a vector document copies, as a Firestore path, or undefined. */
export function sourcePath(
  userId: string,
  doc: { id: string; metadata?: Record<string, unknown> }
): string | undefined {
  const user = `bogle_users/${userId}`;
  const conv = /^conversation_fact_(.+)$/.exec(doc.id);
  if (conv?.[1]) return `${user}/dynamic_facts/${conv[1]}`;
  const graph = `fact_fact_${userId}_`;
  if (doc.id.startsWith(graph)) return `${user}/dynamic_facts/${doc.id.slice(graph.length)}`;
  const col = doc.metadata?.sourceCollection;
  const id = doc.metadata?.sourceDocId;
  if (
    typeof col === 'string' &&
    typeof id === 'string' &&
    /^[\w-]+$/.test(col) &&
    !id.includes('/')
  ) {
    return `${user}/${col}/${id}`;
  }
  return undefined;
}

/**
 * Leaves out results about a forgotten topic or copying a forgotten or
 * deleted source. Graph copies (fact_fact_) may come from `memories`, so
 * only a source that exists and is marked forgotten drops them.
 */
export async function withoutForgotten<
  T extends { document: { id: string; text: string; metadata?: Record<string, unknown> } },
>(
  userId: string,
  results: T[],
  reads: ForgetReads = firestoreReads,
  now = Date.now()
): Promise<T[]> {
  if (results.length === 0) return results;
  const topics = await topicsFor(userId, reads, now);
  if (topics === null) return [];
  const kept = results.filter((r) => !isForgotten(r.document.text, topics));
  const paths = [...new Set(kept.flatMap((r) => sourcePath(userId, r.document) ?? []))];
  if (paths.length === 0) return kept;
  let docs: Map<string, Record<string, unknown> | undefined>;
  try {
    docs = await reads.docs(paths);
  } catch {
    return kept.filter((r) => sourcePath(userId, r.document) === undefined);
  }
  return kept.filter((r) => {
    const path = sourcePath(userId, r.document);
    if (!path) return true;
    const src = docs.get(path);
    if (!src) return r.document.id.startsWith('fact_fact_'); // a graph copy may not be a dynamic fact
    return src.forgottenAt === undefined || src.forgottenAt === null;
  });
}
