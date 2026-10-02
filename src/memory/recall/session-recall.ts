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
 * once when the call starts and each turn is matched in memory: no network
 * on the turn path, and the reply is never interrupted to add a memory.
 *
 * @module memory/recall/session-recall
 */

export interface RecallFact {
  entity: string;
  key: string;
  value: string;
  confidence: number;
}

export interface RecallSnapshot {
  facts: RecallFact[];
  /** Open threads from recent sessions ("ask how the vet visit went"). */
  followUps: string[];
}

export const EMPTY_SNAPSHOT: RecallSnapshot = { facts: [], followUps: [] };

/** The entity the extractor uses for the caller themself. */
const SELF_ENTITY = /^(speaker|user|me)$/i;

const STOPWORDS = new Set(
  'the and but for with that this was are you your have has had not just about what when where how who why can could would should will from they them their there then than into onto been being its it\'s i\'m im my our out get got going really very some like know think well yeah okay also'.split(
    ' '
  )
);

/** Content words: lowercase, 3+ letters, not stopwords, plural "s" dropped ("shoes" = "shoe"). */
export function contentWords(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-z][a-z']{2,}/g) ?? [];
  return new Set(
    words
      .map((w) => w.replace(/'s$/, ''))
      .filter((w) => !STOPWORDS.has(w))
      .map((w) => (w.length > 3 && /[^s]s$/.test(w) ? w.slice(0, -1) : w))
  );
}

/** True when `phrase` appears in `text` as whole words (so "Austin" never matches "exhausting"). */
export function mentions(text: string, phrase: string): boolean {
  const p = phrase.trim().toLowerCase();
  if (p.length < 2) return false;
  const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, 'i').test(text);
}

/** Same fact extracted in several sessions counts once, at its highest confidence. */
export function dedupeFacts(facts: RecallFact[]): RecallFact[] {
  const best = new Map<string, RecallFact>();
  for (const f of facts) {
    if (!f.entity || !f.value) continue;
    const id = `${f.entity}|${f.key}|${f.value}`.toLowerCase();
    const seen = best.get(id);
    if (!seen || f.confidence > seen.confidence) best.set(id, f);
  }
  return [...best.values()];
}

export function factId(f: RecallFact): string {
  return `${f.entity}|${f.key}|${f.value}`.toLowerCase();
}

/**
 * The facts worth bringing to this turn, best first.
 *
 * A fact is relevant when the user names its entity, or shares content words
 * with it. Facts already surfaced this session are skipped so Ferni does not
 * keep repeating the same recollection.
 */
export function recallForTurn(
  snapshot: RecallSnapshot,
  userText: string,
  surfaced: ReadonlySet<string> = new Set(),
  max = 4
): RecallFact[] {
  const words = contentWords(userText);
  const scored: Array<{ fact: RecallFact; score: number }> = [];
  for (const fact of snapshot.facts) {
    if (surfaced.has(factId(fact))) continue;
    const named = !SELF_ENTITY.test(fact.entity) && mentions(userText, fact.entity);
    let overlap = 0;
    for (const w of contentWords(`${fact.entity} ${fact.key} ${fact.value}`)) {
      if (words.has(w)) overlap++;
    }
    if (!named && overlap === 0) continue;
    scored.push({ fact, score: (named ? 2 : 0) + overlap * 0.5 + fact.confidence * 0.5 });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, max).map((s) => s.fact);
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
  for (const f of facts) {
    const subject = SELF_ENTITY.test(f.entity) ? who : f.entity;
    lines.push(`- ${subject}: ${f.key.replace(/_/g, ' ')} = ${f.value}`);
  }
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

const MAX_FACTS = 300;
const MAX_FOLLOW_UPS = 3;

/** Load a user's recall snapshot. Never throws; an unreachable store yields an empty snapshot. */
export async function loadRecallSnapshot(
  store: RecallStore,
  userId: string
): Promise<RecallSnapshot> {
  const [rawFacts, rawSummaries] = await Promise.all([
    store.facts(userId).catch(() => []),
    store.summaries(userId).catch(() => []),
  ]);
  const facts = dedupeFacts(
    rawFacts.slice(0, MAX_FACTS).map((d) => ({
      entity: String(d.entityName ?? ''),
      key: String(d.key ?? ''),
      value: String(d.value ?? ''),
      confidence: typeof d.confidence === 'number' ? d.confidence : 0.5,
    }))
  );
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
