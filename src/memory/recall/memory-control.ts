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
import {
  credentialCategory,
  logCredentialDrops,
  spokenCredentialFilterOn,
} from '../spoken-credential.js';
import { confidenceOf, isForgotten } from './session-recall.js';

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
  /** The caller's facts as recall reads them: newest first, the same cap. */
  facts: (userId: string) => Promise<Array<{ id: string; data: Record<string, unknown> }>>;
  fact: (userId: string, id: string) => Promise<Record<string, unknown> | null>;
  /** Every stored copy of the same fact (entity, key and value), however old. */
  copies: (
    userId: string,
    data: Record<string, unknown>
  ) => Promise<Array<{ id: string; data: Record<string, unknown> }>>;
  /** Topics the caller asked to forget (forget.ts); null when they can't be read. */
  forgotten: (userId: string) => Promise<string[] | null>;
  /** Mark one fact forgotten and take its copies out of recall's indexes. */
  forget: (userId: string, id: string, data: Record<string, unknown>, at: string) => Promise<void>;
  /**
   * Write the corrected fact and mark every copy of the wrong one forgotten
   * (correctedBy the new one) in one write, all or none; then take their copies
   * out of recall's indexes.
   */
  correct: (
    userId: string,
    wrongIds: string[],
    right: { id: string; data: Record<string, unknown> },
    at: string
  ) => Promise<void>;
}

/** The same bar recall uses: facts the extractor itself marked unsure are not recalled. */
const MIN_CONFIDENCE = 0.4;
/** Recall reads the 300 newest facts (memory-recall-hook.ts) and uses only those. */
export const RECALL_READS = 300;
/** A correction is a short fact, not an essay. */
export const MAX_CORRECTION_CHARS = 200;
const SELF = /^(?:speaker|user|me)$/i;

const text = (v: unknown): string => String(v ?? '').trim();

/** Whether recall would use this fact at all (session-recall.ts loadRecallSnapshot). */
function recalled(d: Record<string, unknown>): boolean {
  return (
    typeof d.forgottenAt !== 'string' &&
    text(d.entityName) !== '' &&
    text(d.value) !== '' &&
    confidenceOf(d.confidence) >= MIN_CONFIDENCE
  );
}

function shown(id: string, d: Record<string, unknown>): RememberedFact {
  const entity = text(d.entityName);
  const key = text(d.key).replace(/_/g, ' ');
  return {
    id,
    subject: SELF.test(entity) ? 'you' : entity,
    detail: key ? `${key}: ${text(d.value)}` : text(d.value),
    ...(typeof d.extractedAt === 'string' && { learnedAt: d.extractedAt }),
    ...(typeof d.supersededAt === 'string' && { earlier: true }),
    ...(d.source === 'user-correction' && { fromYou: true }),
  };
}

/** One fact however many times it was extracted: recall counts it once (dedupeFacts). */
const sameFact = (d: Record<string, unknown>): string =>
  `${text(d.entityName)}|${text(d.key)}|${text(d.value)}`.toLowerCase();

const aboutForgotten = (d: Record<string, unknown>, topics: readonly string[]): boolean =>
  isForgotten(`${text(d.entityName)} ${text(d.key)} ${text(d.value)}`, topics);

/**
 * What recall would use, as it reads it: the newest RECALL_READS facts, then not
 * forgotten, not unsure, not about a topic they asked to forget, and each fact once (the
 * most confident copy, then the newest). Nothing when the forgotten topics can't be
 * read, as recall itself fails closed.
 */
async function recalledFacts(
  userId: string,
  store: MemoryControlStore
): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  const [facts, forgotten] = await Promise.all([store.facts(userId), store.forgotten(userId)]);
  if (forgotten === null) return [];
  const best = new Map<string, { id: string; data: Record<string, unknown> }>();
  for (const f of facts.slice(0, RECALL_READS)) {
    if (!recalled(f.data) || aboutForgotten(f.data, forgotten)) continue;
    const seen = best.get(sameFact(f.data));
    // newest first already: a later copy wins only by being more confident
    if (!seen || confidenceOf(f.data.confidence) > confidenceOf(seen.data.confidence)) {
      best.set(sameFact(f.data), f);
    }
  }
  return [...best.values()];
}

export async function listRemembered(
  userId: string,
  store: MemoryControlStore
): Promise<RememberedFact[]> {
  return (await recalledFacts(userId, store)).map((f) => shown(f.id, f.data));
}

/**
 * This fact and every live copy of it: the exact copies anywhere in the collection, and
 * any copy recall would read next call and count as the same fact (dedupeFacts: case
 * apart, a missing key as ''), which an equality query misses.
 */
async function liveCopies(
  userId: string,
  id: string,
  d: Record<string, unknown>,
  store: MemoryControlStore
): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  const [exact, read] = await Promise.all([store.copies(userId, d), store.facts(userId)]);
  const found = new Map<string, Record<string, unknown>>();
  for (const c of [...exact, ...read.filter((f) => sameFact(f.data) === sameFact(d))]) {
    if (c.id !== id && typeof c.data.forgottenAt !== 'string') found.set(c.id, c.data);
  }
  const others = [...found].map(([cid, data]) => ({ id: cid, data }));
  return typeof d.forgottenAt === 'string' ? others : [{ id, data: d }, ...others];
}

/**
 * Forget one fact and every copy of it, so none comes back on the next call. Safe to
 * retry: when an earlier attempt forgot this one but failed on a copy, the copies left
 * are forgotten now. False when nothing live is left to forget.
 */
export async function forgetRemembered(
  userId: string,
  id: string,
  store: MemoryControlStore,
  now: Date = new Date()
): Promise<boolean> {
  const d = await store.fact(userId, id);
  if (!d) return false;
  const live = await liveCopies(userId, id, d, store);
  if (live.length === 0) return false;
  const at = now.toISOString();
  for (const c of live) await store.forget(userId, c.id, c.data, at);
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
  const [old, forgotten] = await Promise.all([store.fact(userId, id), store.forgotten(userId)]);
  // A fact the list hides (forgotten, unsure, empty, about a forgotten topic) can't be corrected
  if (!old || !recalled(old) || forgotten === null || aboutForgotten(old, forgotten)) {
    return { kind: 'not-found' };
  }
  // SPOKEN_CREDENTIAL_FILTER: a code or password typed in as the fix is not kept either
  const credential = spokenCredentialFilterOn() ? credentialCategory(text(old.key), clean) : null;
  if (credential) {
    logCredentialDrops('correction', { [credential]: 1 });
    return { kind: 'invalid', reason: 'Codes and passwords are not kept' };
  }
  const at = now.toISOString();
  const newId = `f_${createHash('sha1').update(`${id}|${clean}|${at}`).digest('hex').slice(0, 24)}`;
  const corrected = {
    entityName: text(old.entityName),
    key: text(old.key),
    value: clean,
    ...(typeof old.factType === 'string' && { factType: old.factType }),
    confidence: 1,
    extractedAt: at,
    source: 'user-correction',
    corrects: id,
    // the graph sync picks up only unsynced facts (fact-sync-ops.ts), as extraction writes them
    syncedToSpanner: false,
  };
  // Every copy of the wrong fact, or recall serves the old value next to the new one
  const wrong = (await liveCopies(userId, id, old, store)).map((c) => c.id);
  await store.correct(userId, wrong, { id: newId, data: corrected }, at);
  return { kind: 'corrected', fact: shown(newId, corrected) };
}
