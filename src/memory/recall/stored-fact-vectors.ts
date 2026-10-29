/**
 * Stored fact vectors for semantic recall (RECALL_VECTOR_INDEX=on, with SEMANTIC_RECALL).
 *
 * Semantic recall embedded every loaded fact at call start, and only the newest
 * 300 facts are loaded, so an older one could never be recalled. With this on,
 * the fact writer stores each fact's vector beside it (dynamic/fact-embeddings.ts),
 * the call's index uses those and embeds only facts without one, and each turn's
 * embedding also asks the store for the nearest stored facts, however old.
 *
 * A fact found that way goes through loadRecallSnapshot's own filters (forgotten
 * topics, forgotten or corrected facts, low confidence, supersession) with the
 * forgotten topics the call started with, before it can be recalled. Until those
 * topics have been read, or when they can't be, nothing is found. With
 * REMEMBER_TO_RECALL, MEMORY_TOOLS_HONEST or FORGET_EVERY_READER on, topics forgotten in this process
 * since count too: a fact remembered while a forget was reading lands unmarked.
 *
 * @module memory/recall/stored-fact-vectors
 */

import { flagOn } from '../../config/env-flag.js';
import { withTimeout } from '../../utils/async.js';
import { createLogger } from '../../utils/safe-logger.js';
import {
  factId,
  loadRecallSnapshot,
  type RecallFact,
  type RecallSnapshot,
  type RecallStore,
} from './session-recall.js';
import { forgetEveryReaderEnabled } from './forget-every-reader.js';
import { forgottenInProcess } from './forget.js';
import { defaultEmbeddingModel, type NearestItems, type RecallItem } from './semantic-recall.js';

const log = createLogger({ module: 'StoredFactVectors' });

export function recallVectorIndexEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return flagOn('RECALL_VECTOR_INDEX', env);
}

/** The Vertex task type a stored fact is embedded with: a memory, not a question. */
export const EMBEDDING_TASK = 'RETRIEVAL_DOCUMENT';
/** The dynamic_facts vector index's size (firestore.indexes.json): text-embedding-005. */
export const FACT_VECTOR_DIMENSION = 768;
/** Stored facts asked for per turn, and how long a search may take before it is dropped. */
export const NEAREST_K = 8;
export const NEAREST_TIMEOUT_MS = 1500;

/** The store, with the nearest stored facts to a vector (recall-firestore-store.ts). */
export interface VectorRecallStore extends RecallStore {
  nearest?: (
    userId: string,
    queryVector: number[],
    k: number
  ) => Promise<Array<Record<string, unknown>>>;
}

/** A fact as one line to embed: "Biscuit breed: golden retriever". */
export function factText(
  f: Pick<RecallFact, 'entity' | 'key' | 'value'>,
  userName?: string
): string {
  const subject = /^(speaker|user|me)$/i.test(f.entity) ? userName || 'they' : f.entity;
  return `${subject} ${f.key.replace(/_/g, ' ')}: ${f.value}`;
}

/** A stored dynamic_facts document's text to embed, as recall reads its fields. */
export function storedFactText(d: Record<string, unknown>): string {
  return factText({
    entity: String(d.entityName ?? ''),
    key: String(d.key ?? ''),
    value: String(d.value ?? ''),
  });
}

/** A stored vector as numbers: a Firestore VectorValue (toArray) or a plain array. */
export function vectorOf(raw: unknown): number[] | undefined {
  const toArray = (raw as { toArray?: unknown } | null)?.toArray;
  const v: unknown = Array.isArray(raw)
    ? raw
    : typeof toArray === 'function'
      ? toArray.call(raw)
      : undefined;
  return Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'number') ? v : undefined;
}

export interface StoredVectors {
  /** The store to load the snapshot from: it notes stored vectors and the forgotten topics. */
  store: RecallStore;
  /** For the index: the nearest stored facts that pass recall's filters, with their vectors. */
  nearest: NearestItems;
  /** The snapshot plus the facts found so far, for recallForTurn. */
  pool: (snapshot: RecallSnapshot) => RecallSnapshot;
  /** The stored vector embedded from exactly this text by the current model, if any. */
  vectorFor: (text: string) => number[] | undefined;
}

/** What the index embeds for these facts, with a stored vector wherever one matches. */
export function factItems(
  facts: RecallFact[],
  userName: string | undefined,
  stored?: StoredVectors
): RecallItem[] {
  return facts.map((f) => {
    // Stored as written, without the caller's name: a fact about them reads "they ...".
    const vector = stored?.vectorFor(factText(f));
    const item = { id: factId(f), text: factText(f, userName) };
    return vector ? { ...item, vector } : item;
  });
}

/** Topics forgotten during the call count in the search (see the module comment). */
const inCallForgets = (): boolean =>
  flagOn('REMEMBER_TO_RECALL') || flagOn('MEMORY_TOOLS_HONEST') || forgetEveryReaderEnabled();

export function createStoredVectors(
  base: VectorRecallStore,
  userId: string,
  model: Promise<string> = defaultEmbeddingModel()
): StoredVectors {
  const byText = new Map<string, number[]>();
  // [] when the store has no forget list, as loadRecallSnapshot reads it; null until read.
  const forget = base.forgotten;
  let topics: string[] | null = forget ? null : [];
  const found: RecallFact[] = [];
  // One query at a time: a timed-out one still holds this until Firestore answers.
  let querying = false;
  let pooled: { from: RecallSnapshot; count: number; to: RecallSnapshot } | undefined;
  const modelName = model.catch((error: unknown) => {
    log.warn({ error: String(error) }, 'Embedding model unknown: stored vectors unused');
    return null;
  });

  const vectorsOf = async (
    docs: Array<Record<string, unknown>>
  ): Promise<Map<string, number[]>> => {
    const name = await modelName;
    const out = new Map<string, number[]>();
    for (const d of docs) {
      const mine = d.embeddingModel === name && d.embeddingTask === EMBEDDING_TASK;
      const v = mine ? vectorOf(d.embedding) : undefined;
      if (v?.length === FACT_VECTOR_DIMENSION) out.set(storedFactText(d), v);
    }
    return out;
  };

  return {
    store: {
      async facts(u) {
        const docs = await base.facts(u);
        for (const [text, v] of await vectorsOf(docs)) byText.set(text, v);
        return docs;
      },
      summaries: (u) => base.summaries(u),
      ...(forget && { forgotten: async (u: string) => (topics = await forget.call(base, u)) }),
    },
    async nearest(queryVector) {
      const forgotten = topics;
      if (!base.nearest || forgotten === null || querying) return [];
      querying = true;
      const query = base.nearest(userId, queryVector, NEAREST_K).finally(() => {
        querying = false;
      });
      const docs = await withTimeout(query, NEAREST_TIMEOUT_MS, 'Nearest facts');
      const vectors = await vectorsOf(docs);
      // The same filters as the call's snapshot, with the topics it was loaded with.
      const now = inCallForgets() ? [...forgotten, ...forgottenInProcess(userId)] : forgotten;
      const { facts } = await loadRecallSnapshot(
        { facts: async () => docs, summaries: async () => [], forgotten: async () => now },
        userId
      );
      const known = new Set(found.map(factId));
      const items: RecallItem[] = [];
      for (const f of facts) {
        const text = factText(f);
        const vector = vectors.get(text);
        if (!vector || known.has(factId(f))) continue;
        found.push(f);
        items.push({ id: factId(f), text, vector });
      }
      return items;
    },
    pool(snapshot) {
      if (found.length === 0) return snapshot;
      if (pooled?.from !== snapshot || pooled.count !== found.length) {
        const ids = new Set(snapshot.facts.map(factId));
        const more = found.filter((f) => !ids.has(factId(f)));
        pooled = {
          from: snapshot,
          count: found.length,
          to: { ...snapshot, facts: [...snapshot.facts, ...more] },
        };
      }
      return pooled.to;
    },
    vectorFor: (text) => byText.get(text),
  };
}
