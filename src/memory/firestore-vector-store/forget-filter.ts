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
 * fact_fact_<uid>_<id>), a call summary by its id (conversation_summary_<id>,
 * dropped when the caller disputed an item in it), any other copy by the source it records
 * (metadata.sourceCollection / sourceDocId). If the forgotten topics or the
 * source docs can't be read, the affected results are dropped (fails closed).
 *
 * @module memory/firestore-vector-store/forget-filter
 */
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { withoutHeldAt } from '../../utils/held-window-check.js';
import { forgetGeneration, forgottenTopicsOrNull } from '../recall/forget.js';
import { isForgotten } from '../recall/session-recall.js';

/** Topics change rarely; a short cache keeps search from paying a read every time. */
const TOPICS_TTL_MS = 15_000;
/** A read slower than this counts as unreadable, so search fails closed instead of hanging. */
export const READ_TIMEOUT_MS = 300;
const topicsCache = new Map<string, { at: number; gen: number; topics: string[] }>();

/** For tests. */
export function clearForgottenTopicsCache(userId?: string): void {
  if (userId) topicsCache.delete(userId);
  else topicsCache.clear();
}

async function withinTimeout<T>(read: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('forget read timed out')), READ_TIMEOUT_MS);
  });
  try {
    return await Promise.race([read, late]);
  } finally {
    clearTimeout(timer);
  }
}

export interface ForgetReads {
  /** The caller's forgotten topics, or null when they can't be read (forget.ts). */
  topics: (userId: string) => Promise<string[] | null>;
  /** Source docs by path; a missing doc maps to undefined. */
  docs: (paths: string[]) => Promise<Map<string, Record<string, unknown> | undefined>>;
}

const firestoreReads: ForgetReads = {
  topics: async (userId) => forgottenTopicsOrNull(userId),
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
  const gen = forgetGeneration(userId); // a forget in this process reads them again at once
  const hit = topicsCache.get(userId);
  if (hit && hit.gen === gen && now - hit.at < TOPICS_TTL_MS) return hit.topics;
  try {
    const raw: unknown = await withinTimeout(reads.topics(userId));
    const topics = Array.isArray(raw) && raw.every((t) => typeof t === 'string') ? raw : null;
    if (topics) topicsCache.set(userId, { at: now, gen, topics });
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
  const ok = (id: string) => id !== '' && id !== '.' && id !== '..' && !id.includes('/');
  const conv = /^conversation_fact_(.+)$/.exec(doc.id);
  if (conv?.[1]) return ok(conv[1]) ? `${user}/dynamic_facts/${conv[1]}` : undefined;
  // A call summary's copy (user-memory-indexer.ts writes conversation_<summary id>).
  const summary = /^conversation_(summary_.+)$/.exec(doc.id);
  if (summary?.[1]) return ok(summary[1]) ? `${user}/summaries/${summary[1]}` : undefined;
  const graph = `fact_fact_${userId}_`;
  if (doc.id.startsWith(graph)) {
    const id = doc.id.slice(graph.length);
    return ok(id) ? `${user}/dynamic_facts/${id}` : undefined;
  }
  const col = doc.metadata?.sourceCollection;
  const id = doc.metadata?.sourceDocId;
  if (typeof col === 'string' && typeof id === 'string' && /^[\w-]+$/.test(col) && ok(id)) {
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
  // MINOR_CARE: nor what was indexed during a purged held call (held-index-purge.ts)
  const live = withoutHeldAt(userId, results, (r) => r.document.metadata?.indexedAt);
  const topics = await topicsFor(userId, reads, now);
  if (topics === null) return [];
  const kept = live.filter((r) => !isForgotten(r.document.text, topics));
  const paths = [...new Set(kept.flatMap((r) => sourcePath(userId, r.document) ?? []))];
  if (paths.length === 0) return kept;
  let docs: Map<string, Record<string, unknown> | undefined>;
  try {
    docs = await withinTimeout(reads.docs(paths));
  } catch {
    return kept.filter((r) => sourcePath(userId, r.document) === undefined);
  }
  return kept.filter((r) => {
    const path = sourcePath(userId, r.document);
    if (!path) return true;
    const src = docs.get(path);
    // A graph copy may not be a dynamic fact; a summary copy may come from a legacy collection.
    if (!src) return /^(?:fact_fact_|conversation_summary_)/.test(r.document.id);
    // A summary with an item the caller disputed (dispute.ts) is dropped whole: its text has it.
    if (Array.isArray(src.disputedItems) && src.disputedItems.length > 0) return false;
    return src.forgottenAt === undefined || src.forgottenAt === null;
  });
}
