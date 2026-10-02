/**
 * Session recall: what Ferni remembers about the caller, ready on every turn.
 *
 * The live pipeline writes what the user shares to bogle_users/{id}/
 * dynamic_facts (e.g. "Biscuit | breed = golden retriever") and session
 * summaries with follow-up items. Per-turn retrieval read entity_store and
 * the vector store instead, which nothing fills any more, so recall returned
 * nothing (measured 2026-09-27: 0 results for a user with 56 facts, 32 of
 * them about their dog).
 *
 * A user's memory is small (tens to low hundreds of facts), so it is loaded
 * once when the call starts (most recently updated first, user-edited facts
 * always included) and each turn is matched in memory: no network on the
 * turn path, and the reply is never interrupted to add a memory. Ranking
 * (recall-ranking.ts) blends keyword overlap with semantic similarity when
 * embeddings are available.
 *
 * @module memory/recall/session-recall
 */

import { toMillis } from '../dynamic/firestore-shapes.js';
import {
  SELF_ENTITY,
  contentWords,
  displayText,
  mentions,
  rankFacts,
  type RankableFact,
} from './recall-ranking.js';

export { contentWords, mentions };

export interface RecallFact extends RankableFact {
  entity: string;
  key: string;
  value: string;
  confidence: number;
  /** Firestore doc id, when known. */
  id?: string;
}

export interface RecallSnapshot {
  facts: RecallFact[];
  /** Open threads from recent sessions ("ask how the vet visit went"). */
  followUps: string[];
}

export const EMPTY_SNAPSHOT: RecallSnapshot = { facts: [], followUps: [] };

/** Identity of a fact for dedupe and "already surfaced" tracking. */
export function factId(f: RecallFact): string {
  if (f.id) return f.id;
  if (!f.key && f.text) return `text:${f.text.toLowerCase()}`;
  return `${f.entity}|${f.key}|${f.value}`.toLowerCase();
}

/**
 * Same fact extracted in several sessions counts once, at its highest
 * confidence. Legacy duplicates (random ids, before deterministic ids) are
 * collapsed by entity/key/value.
 */
export function dedupeFacts(facts: RecallFact[]): RecallFact[] {
  const best = new Map<string, RecallFact>();
  for (const f of facts) {
    if (!f.text && (!f.entity || !f.value)) continue;
    const id = f.key ? `${f.entity}|${f.key}|${f.value}`.toLowerCase() : factId(f);
    const seen = best.get(id);
    if (
      !seen ||
      (f.userEdited && !seen.userEdited) ||
      (!seen.userEdited && f.confidence > seen.confidence)
    ) {
      best.set(id, f);
    }
  }
  return [...best.values()];
}

export interface RecallTurnOptions {
  /** Max characters of fact text for this call. */
  maxChars?: number;
  /** Let the best fact through even if it alone exceeds maxChars (default true). */
  firstAlwaysFits?: boolean;
  queryEmbedding?: number[] | null;
  factEmbedding?: (fact: RecallFact) => number[] | undefined;
  minSimilarity?: number;
}

/**
 * The facts worth bringing to this turn, best first.
 *
 * A fact is relevant when the user names its entity, shares content words
 * with it, or (with embeddings) is close in meaning. Facts already surfaced
 * this session are skipped so Ferni does not keep repeating itself.
 */
export function recallForTurn(
  snapshot: RecallSnapshot,
  userText: string,
  surfaced: ReadonlySet<string> = new Set(),
  max = 4,
  opts: RecallTurnOptions = {}
): RecallFact[] {
  const candidates = snapshot.facts.filter((f) => !surfaced.has(factId(f)));
  return rankFacts(candidates, userText, {
    maxItems: max,
    maxChars: opts.maxChars ?? Number.POSITIVE_INFINITY,
    firstAlwaysFits: opts.firstAlwaysFits,
    queryEmbedding: opts.queryEmbedding,
    factEmbedding: opts.factEmbedding as ((f: RankableFact) => number[] | undefined) | undefined,
    minSimilarity: opts.minSimilarity,
  }).map((r) => r.fact);
}

/** A context note for the LLM, or null when there is nothing to recall. */
export function formatRecall(
  facts: RecallFact[],
  followUps: string[],
  userName?: string
): string | null {
  if (facts.length === 0 && followUps.length === 0) return null;
  const who = userName || 'them';
  const lines: string[] = [`[WHAT YOU REMEMBER ABOUT ${who.toUpperCase()}]`];
  for (const f of facts) lines.push(`- ${displayText(f, who)}`);
  if (followUps.length > 0) {
    lines.push('Open threads from last time:');
    for (const item of followUps) lines.push(`- ${item}`);
  }
  lines.push(
    'Use at most one of these, and only if it fits naturally, the way a friend who remembers would. Never list them or say you looked it up.'
  );
  return lines.join('\n');
}

/** The slice of Firestore this module reads; injected so tests need no database. */
export interface RecallStore {
  facts(userId: string): Promise<Array<Record<string, unknown>>>;
  summaries(userId: string): Promise<Array<Record<string, unknown>>>;
}

/** Facts kept in the snapshot (most recent first); MEMORY_RECALL_SNAPSHOT_FACTS overrides. */
export const MAX_FACTS = 400;
const MAX_FOLLOW_UPS = 3;

/** Map a stored dynamic_facts document onto a RecallFact (legacy and contract fields). */
export function toRecallFact(d: Record<string, unknown>): RecallFact | null {
  const entity = String(d.entityName ?? '');
  const key = String(d.key ?? '');
  const value = d.value === undefined || d.value === null ? '' : String(d.value);
  const text = typeof d.text === 'string' && d.text.trim() ? d.text.trim() : undefined;
  if (!text && (!entity || !value)) return null;
  const fact: RecallFact = {
    entity: entity || 'user',
    key,
    value,
    confidence: typeof d.confidence === 'number' ? d.confidence : 0.5,
  };
  if (typeof d.id === 'string') fact.id = d.id;
  // An edited fact's text is what the user said; the extractor's fields are stale.
  if (text) fact.text = text;
  if (d.userEdited === true) fact.userEdited = true;
  const updated = toMillis(d.updatedAt ?? d.extractedAt);
  if (updated) fact.updatedAtMs = updated;
  return fact;
}

/** Load a user's recall snapshot. Never throws; an unreachable store yields an empty snapshot. */
export async function loadRecallSnapshot(
  store: RecallStore,
  userId: string,
  maxFacts = MAX_FACTS
): Promise<RecallSnapshot> {
  const [rawFacts, rawSummaries] = await Promise.all([
    store.facts(userId).catch(() => []),
    store.summaries(userId).catch(() => []),
  ]);
  const mapped = rawFacts.map(toRecallFact).filter((f): f is RecallFact => f !== null);
  // Most recently updated first; edited facts always survive the cap.
  mapped.sort((a, b) => (b.updatedAtMs ?? 0) - (a.updatedAtMs ?? 0) || b.confidence - a.confidence);
  const edited = mapped.filter((f) => f.userEdited);
  const rest = mapped.filter((f) => !f.userEdited).slice(0, Math.max(0, maxFacts - edited.length));
  const facts = dedupeFacts([...edited, ...rest]);

  const followUps: string[] = [];
  for (const s of rawSummaries) {
    for (const item of Array.isArray(s.followUpItems) ? s.followUpItems : []) {
      const text = String(item).trim();
      if (text && !followUps.includes(text)) followUps.push(text);
      if (followUps.length >= MAX_FOLLOW_UPS) break;
    }
    if (followUps.length >= MAX_FOLLOW_UPS) break;
  }
  return { facts, followUps };
}

export { SELF_ENTITY };
