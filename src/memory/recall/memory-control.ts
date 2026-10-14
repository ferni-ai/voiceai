/**
 * What the caller can see and change about what Ferni remembers: the facts
 * live recall actually reads (dynamic_facts), one by one.
 *
 * The app's "What I've Learned" listed persona memories and profile items,
 * and its forget button deleted from the persona memory store, which recall
 * never reads: a "forgotten" fact came back on the next call. These are the
 * facts recall uses, with the same filters (session-recall.ts), so what the
 * caller sees is what Ferni will remember, and what they forget or correct
 * is gone from the next call.
 *
 * Forgetting marks the fact forgotten the way forget.ts does (forgottenAt,
 * which recall skips, and its copies taken out of the indexes per-turn
 * memory search reads); correcting does the same to the wrong fact (it was
 * never true, so it is not "how things were") and writes the corrected one
 * as said by the caller, both in one write.
 *
 * Firestore: storage/memory-control-store.ts.
 *
 * @module memory/recall/memory-control
 */
import { createHash } from 'node:crypto';

export interface RememberedFact {
  id: string;
  /** Who or what the fact is about; "you" for the caller. */
  subject: string;
  /** What is remembered: "breed: golden retriever". */
  detail: string;
  /** When it was learned (ISO), if known. */
  learnedAt?: string;
  /** A newer fact replaced it (fact-supersession.ts): shown as how things were. */
  earlier?: boolean;
  /** The caller said this themselves in the app, rather than on a call. */
  fromYou?: boolean;
}

export interface MemoryControlStore {
  /** The caller's facts, newest first, raw. */
  facts: (userId: string) => Promise<Array<{ id: string; data: Record<string, unknown> }>>;
  fact: (userId: string, id: string) => Promise<Record<string, unknown> | null>;
  /** Mark one fact forgotten and take its copies out of recall's indexes. */
  forget: (userId: string, id: string, data: Record<string, unknown>, at: string) => Promise<void>;
  /**
   * Write the corrected fact and mark the wrong one forgotten (correctedBy the
   * new one) in one write, both or neither; then take the wrong one's copies
   * out of recall's indexes.
   */
  correct: (
    userId: string,
    wrongId: string,
    right: { id: string; data: Record<string, unknown> },
    at: string
  ) => Promise<void>;
}

/** The same bar recall uses: facts the extractor itself marked unsure are not recalled. */
const MIN_CONFIDENCE = 0.4;
/** The most facts listed at once. */
export const MAX_LISTED = 300;
/** A correction is a short fact, not an essay. */
export const MAX_CORRECTION_CHARS = 200;
const SELF = /^(?:speaker|user|me)$/i;

function confidence(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  if (raw === 'high') return 0.9;
  if (raw === 'low') return 0.3;
  return raw === 'medium' ? 0.6 : 0.5;
}

/** Whether recall would use this fact at all (forgotten and unsure facts are not). */
function recalled(d: Record<string, unknown>): boolean {
  return (
    typeof d.forgottenAt !== 'string' &&
    typeof d.entityName === 'string' &&
    typeof d.value === 'string' &&
    d.value.trim() !== '' &&
    confidence(d.confidence) >= MIN_CONFIDENCE
  );
}

function shown(id: string, d: Record<string, unknown>): RememberedFact {
  const entity = String(d.entityName).trim();
  const key = String(d.key ?? '')
    .replace(/_/g, ' ')
    .trim();
  return {
    id,
    subject: SELF.test(entity) ? 'you' : entity,
    detail: key ? `${key}: ${String(d.value).trim()}` : String(d.value).trim(),
    ...(typeof d.extractedAt === 'string' && { learnedAt: d.extractedAt }),
    ...(typeof d.supersededAt === 'string' && { earlier: true }),
    ...(d.source === 'user-correction' && { fromYou: true }),
  };
}

export async function listRemembered(
  userId: string,
  store: MemoryControlStore
): Promise<RememberedFact[]> {
  const facts = await store.facts(userId);
  return facts
    .filter((f) => recalled(f.data))
    .slice(0, MAX_LISTED)
    .map((f) => shown(f.id, f.data));
}

/** Forget one fact. False when the caller has no such fact (or it is already forgotten). */
export async function forgetRemembered(
  userId: string,
  id: string,
  store: MemoryControlStore,
  now: Date = new Date()
): Promise<boolean> {
  const d = await store.fact(userId, id);
  if (!d || typeof d.forgottenAt === 'string') return false;
  await store.forget(userId, id, d, now.toISOString());
  return true;
}

export type CorrectResult =
  | { kind: 'corrected'; fact: RememberedFact }
  | { kind: 'not-found' }
  | { kind: 'invalid'; reason: string };

/**
 * Correct one fact: the wrong one is forgotten and the right one written as
 * the caller said it. The value is cleaned of control characters and capped.
 */
export async function correctRemembered(
  userId: string,
  id: string,
  value: unknown,
  store: MemoryControlStore,
  now: Date = new Date()
): Promise<CorrectResult> {
  if (typeof value !== 'string') return { kind: 'invalid', reason: 'value must be text' };
  const clean = value
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return { kind: 'invalid', reason: 'value is empty' };
  if (clean.length > MAX_CORRECTION_CHARS) {
    return { kind: 'invalid', reason: `value is over ${MAX_CORRECTION_CHARS} characters` };
  }
  const old = await store.fact(userId, id);
  if (!old || typeof old.forgottenAt === 'string' || typeof old.entityName !== 'string') {
    return { kind: 'not-found' };
  }
  const at = now.toISOString();
  const newId = `f_${createHash('sha1').update(`${id}|${clean}|${at}`).digest('hex').slice(0, 24)}`;
  const corrected = {
    entityName: old.entityName,
    key: typeof old.key === 'string' ? old.key : '',
    value: clean,
    ...(typeof old.factType === 'string' && { factType: old.factType }),
    confidence: 1,
    extractedAt: at,
    source: 'user-correction',
    corrects: id,
  };
  await store.correct(userId, id, { id: newId, data: corrected }, at);
  return { kind: 'corrected', fact: shown(newId, corrected) };
}
