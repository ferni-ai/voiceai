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
 * write (fact-embeddings.ts, RECALL_VECTOR_INDEX). A fact holding a credential is
 * never written, whatever SPOKEN_CREDENTIAL_FILTER says (spoken-credential.ts, and
 * credential-shapes.ts for a whole sentence), and only a member's fact is written.
 * What those word rules let through is read by a model before it is embedded or
 * stored, and kept only on a clear no (secret-check.ts; fails closed).
 *
 * One document per fact text (factDocId), created and never overwritten: the
 * same thing remembered twice is one fact, and a fact the caller forgot
 * (forget.ts: forgottenAt, its vector removed) is never written over or
 * re-embedded. Forgetting needs nothing more: forgetTopic and the app's forget
 * button mark dynamic_facts, and account erasure deletes the collection.
 * With FORGET_EVERY_READER on, a fact about a topic the caller has asked to
 * forget is not written: forgetTopic marks only the documents that exist, so
 * one forgotten while this fact was being embedded would land unmarked and
 * reach the call's vector recall (forget-every-reader.ts; fails closed).
 *
 * MEMORY_TOOLS_HONEST=on: the remember tools answer from this write
 * (keepForRecall says what happened), so it runs whatever REMEMBER_TO_RECALL
 * says, checks the forgotten topics whatever FORGET_EVERY_READER says (failing
 * closed: a topic list that can't be read keeps nothing), and keeps no phone
 * number or email as a free-text fact (hasContactData, handed in by the agent
 * process, since intelligence imports memory; until it is, nothing is kept).
 *
 * Firestore: storage/remembered-fact-store.ts, handed in by the agent process
 * (agents/remembered-fact-store-register.ts); until it is, nothing is written.
 *
 * @module memory/dynamic/remembered-facts
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { isMemberIdentity } from '../../services/identity/member-identity.js';
import { errorClass } from '../../utils/error-class.js';
import { credentialInText } from '../credential-shapes.js';
import { readSecret, type SecretCheckDeps } from '../secret-check.js';
import { forgottenCheck, forgottenWithin } from '../recall/forget-every-reader.js';
import { credentialCategory, logCredentialDrops } from '../spoken-credential.js';
import { factDocId } from './extraction-firestore-docs.js';
import { withFactEmbeddings, type FactEmbeddingDeps } from './fact-embeddings.js';

const log = createLogger({ module: 'RememberedFacts' });

export const CALLER_ASSERTED = 'caller_asserted';
/** The caller themself, as the extractor names them; recall reads it as "they". */
export const REMEMBERED_ENTITY = 'user';
export const REMEMBERED_KEY = 'asked_to_remember';

export function memoryToolsHonestOn(env: Env = process.env): boolean {
  return flagOn('MEMORY_TOOLS_HONEST', env);
}

export function rememberToRecallOn(env: Env = process.env): boolean {
  return flagOn('REMEMBER_TO_RECALL', env) || memoryToolsHonestOn(env);
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
  // Always, flag or not: a PIN or password they asked Ferni to remember never becomes an
  // embedded, recallable fact (the memories write is the tool's own, unchanged)
  const credential = credentialCategory(REMEMBERED_KEY, value) ?? credentialInText(value);
  if (credential) {
    logCredentialDrops('remember', { [credential]: 1 });
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
/** True for a phone number or email in any spelling (intelligence's hasContactData). */
export type ContactDataCheck = (text: string) => boolean;
let contactGuard: ContactDataCheck | null = null;

/** Called once by the agent process with the Firestore store; null unplugs (tests). */
export function useRememberedFactStore(store: RememberedFactStore | null): void {
  registered = store;
}

/** Called once by the agent process with the contact-data rule; null unplugs (tests). */
export function useContactDataCheck(check: ContactDataCheck | null): void {
  contactGuard = check;
}

export interface RememberToRecallDeps {
  store?: RememberedFactStore;
  contactData?: ContactDataCheck;
  embedding?: FactEmbeddingDeps;
  secretCheck?: SecretCheckDeps;
  env?: Env;
  now?: () => Date;
}

/** What keepForRecall did; `id` is the dynamic_facts document recall reads. */
export type KeepOutcome =
  | { kind: 'kept'; id: string }
  /** The same fact text is already on file (one document per text, never overwritten). */
  | { kind: 'already'; id: string }
  | {
      kind: 'refused';
      reason: 'off' | 'not_member' | 'empty' | 'credential' | 'secret' | 'forgotten' | 'contact';
    }
  /** No store, an unreadable forgotten list, or a write that threw. */
  | { kind: 'failed' };

/** The topics check for a write: under MEMORY_TOOLS_HONEST always, and fails closed (null = unreadable). */
async function forgottenFor(
  userId: string,
  env: Env | undefined
): Promise<((text: string) => boolean) | 'unreadable' | null> {
  if (!memoryToolsHonestOn(env)) return forgottenCheck(userId, 'remember-to-recall', env);
  return (await forgottenWithin(userId, 'remember-to-recall')) ?? 'unreadable';
}

/**
 * With REMEMBER_TO_RECALL or MEMORY_TOOLS_HONEST on, the remembered fact as a
 * caller_asserted dynamic_facts document, embedded on write. Never throws.
 */
export async function keepForRecall(
  userId: string,
  r: RememberedFact,
  deps: RememberToRecallDeps = {}
): Promise<KeepOutcome> {
  if (!rememberToRecallOn(deps.env)) return { kind: 'refused', reason: 'off' };
  // Only a member's own: a placeholder or anon:/onbehalf: id is one bucket for many callers
  if (!isMemberIdentity(userId)) return { kind: 'refused', reason: 'not_member' };
  try {
    const doc = rememberedFactDoc(r, (deps.now?.() ?? new Date()).toISOString());
    if (!doc) return { kind: 'refused', reason: r.fact.trim() ? 'credential' : 'empty' };
    const value = String(doc.data.value);
    // Every caller of the writer (remember, rememberImportantFact, replaceRemembered) gets this;
    // with no guard handed in, nothing is kept (fails closed)
    if (memoryToolsHonestOn(deps.env)) {
      const contactData = deps.contactData ?? contactGuard;
      if (!contactData) return { kind: 'failed' };
      if (contactData(value)) return { kind: 'refused', reason: 'contact' };
    }
    // The word rules miss phrasings (#2514): nothing reaches the embedder or the store without a clear no
    const secret = await readSecret(value, deps.secretCheck);
    if (secret !== 'clear') {
      if (secret === 'secret') log.info('Remembered fact holds a secret: not written for recall');
      return secret === 'secret' ? { kind: 'refused', reason: 'secret' } : { kind: 'failed' };
    }
    const [data] = await withFactEmbeddings([doc.data], deps.embedding);
    const store = deps.store ?? registered;
    // Checked after the embedding: a forget during it marked nothing for this fact
    const forgotten = await forgottenFor(userId, deps.env);
    if (forgotten === 'unreadable') return { kind: 'failed' };
    if (forgotten?.(value)) {
      log.info('Remembered fact is about a forgotten topic: not written for recall');
      return { kind: 'refused', reason: 'forgotten' };
    }
    if (!store) {
      log.warn('REMEMBER_TO_RECALL is on but no fact store is registered');
      return { kind: 'failed' };
    }
    const created = await store.create(userId, [{ id: doc.id, data }]);
    return { kind: created > 0 ? 'kept' : 'already', id: doc.id };
  } catch (error) {
    log.warn({ error: errorClass(error) }, 'Remembered fact not written for recall');
    return { kind: 'failed' };
  }
}

/** keepForRecall, as true when it created the document. */
export async function rememberToRecall(
  userId: string,
  r: RememberedFact,
  deps: RememberToRecallDeps = {}
): Promise<boolean> {
  return (await keepForRecall(userId, r, deps)).kind === 'kept';
}
