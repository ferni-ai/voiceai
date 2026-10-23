/**
 * What a caller asks Ferni to remember, kept where recall looks (#2474).
 *
 * rememberAboutUser writes bogle_users/{uid}/memories, which recall never
 * reads: semantic recall reads dynamic_facts and summaries. So "remember that
 * my sister is moving to Denver" could not come back by meaning on a later
 * call. With REMEMBER_TO_RECALL=on the tool also writes the fact to
 * dynamic_facts as the caller's own: source caller_asserted, confidence 1 (as
 * a correction typed in the app is, memory-control.ts), so recall's confidence
 * term ranks it at least as high as any extracted fact. It is embedded on
 * write (fact-embeddings.ts, RECALL_VECTOR_INDEX).
 *
 * One document per fact text (factDocId), created and never overwritten: the
 * same thing remembered twice is one fact, and a fact the caller forgot
 * (forget.ts: forgottenAt, its vector removed) is never written over or
 * re-embedded. Forgetting needs nothing more: forgetTopic and the app's forget
 * button mark dynamic_facts, and account erasure deletes the collection.
 *
 * Firestore: storage/remembered-fact-store.ts, handed in by the agent process
 * (agents/remembered-fact-store-register.ts); until it is, nothing is written.
 *
 * @module memory/dynamic/remembered-facts
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { withoutSpokenCredentials } from '../spoken-credential.js';
import { factDocId } from './extraction-firestore-docs.js';
import { withFactEmbeddings, type FactEmbeddingDeps } from './fact-embeddings.js';

const log = createLogger({ module: 'RememberedFacts' });

export const CALLER_ASSERTED = 'caller_asserted';
/** The caller themself, as the extractor names them; recall reads it as "they". */
export const REMEMBERED_ENTITY = 'user';
export const REMEMBERED_KEY = 'asked_to_remember';

export function rememberToRecallOn(env: Env = process.env): boolean {
  return flagOn('REMEMBER_TO_RECALL', env);
}

export interface RememberedFact {
  fact: string;
  /** The memories document it copies, so either can be traced to the other. */
  memoryId?: string;
  category?: string;
  sessionId?: string;
}

export interface FactDocWrite {
  id: string;
  data: Record<string, unknown>;
}

/** The dynamic_facts document for a remembered fact, or null when there is nothing to keep. */
export function rememberedFactDoc(r: RememberedFact, at: string): FactDocWrite | null {
  const value = r.fact.replace(/\s+/g, ' ').trim();
  if (!value) return null;
  // SPOKEN_CREDENTIAL_FILTER: a door code they asked to remember is no fact for recall either
  if (withoutSpokenCredentials([{ key: REMEMBERED_KEY, value }], 'remember').length === 0) {
    return null;
  }
  return {
    id: factDocId(REMEMBERED_ENTITY, REMEMBERED_KEY, value),
    data: {
      extractedAt: at,
      ...(r.sessionId && { sessionId: r.sessionId }),
      source: CALLER_ASSERTED,
      syncedToSpanner: false,
      entityName: REMEMBERED_ENTITY,
      factType: 'attribute',
      key: REMEMBERED_KEY,
      value,
      confidence: 1,
      ...(r.category && { category: r.category }),
      ...(r.memoryId && { memoryId: r.memoryId }),
    },
  };
}

/** Creates the documents that don't exist yet; how many it created. Never overwrites. */
export interface RememberedFactStore {
  create: (userId: string, docs: FactDocWrite[]) => Promise<number>;
}

let registered: RememberedFactStore | null = null;

/** Called once by the agent process with the Firestore store; null unplugs (tests). */
export function useRememberedFactStore(store: RememberedFactStore | null): void {
  registered = store;
}

export interface RememberToRecallDeps {
  store?: RememberedFactStore;
  embedding?: FactEmbeddingDeps;
  env?: Env;
  now?: () => Date;
}

/**
 * With REMEMBER_TO_RECALL on, the remembered fact as a caller_asserted
 * dynamic_facts document, embedded on write. True when it created one. Never throws.
 */
export async function rememberToRecall(
  userId: string,
  r: RememberedFact,
  deps: RememberToRecallDeps = {}
): Promise<boolean> {
  if (!rememberToRecallOn(deps.env)) return false;
  try {
    const doc = rememberedFactDoc(r, (deps.now?.() ?? new Date()).toISOString());
    if (!doc) return false;
    const [data] = await withFactEmbeddings([doc.data], deps.embedding);
    const store = deps.store ?? registered;
    if (!store) {
      log.warn('REMEMBER_TO_RECALL is on but no fact store is registered');
      return false;
    }
    return (await store.create(userId, [{ id: doc.id, data }])) > 0;
  } catch (error) {
    log.warn({ error: String(error) }, 'Remembered fact not written for recall');
    return false;
  }
}
