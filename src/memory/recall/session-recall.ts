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
  /** When it was extracted (ISO), so Ferni knows how old the memory is. */
  extractedAt?: string;
}

export interface RecallSnapshot {
  facts: RecallFact[];
  /** Open threads from recent sessions ("ask how the vet visit went"). */
  followUps: string[];
  /** Bits that were genuinely funny between them on recent calls (summaries' insideJokes). */
  insideJokes?: string[];
}

export const EMPTY_SNAPSHOT: RecallSnapshot = { facts: [], followUps: [], insideJokes: [] };

/**
 * INSIDE_JOKES=on lets Ferni bring back a bit the two of them really shared
 * (off by default). Only things the summarizer saw land in a past call qualify,
 * never stock jokes, so Ferni can't fake a history it doesn't have.
 */
export function insideJokesEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.INSIDE_JOKES === 'on';
}

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

/** Same fact extracted in several sessions counts once: highest confidence, then newest. */
export function dedupeFacts(facts: RecallFact[]): RecallFact[] {
  const best = new Map<string, RecallFact>();
  for (const f of facts) {
    if (!f.entity || !f.value) continue;
    const id = `${f.entity}|${f.key}|${f.value}`.toLowerCase();
    const seen = best.get(id);
    const newer = (f.extractedAt ?? '') > (seen?.extractedAt ?? '');
    if (!seen || f.confidence > seen.confidence || (f.confidence === seen.confidence && newer)) {
      best.set(id, f);
    }
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
  max = 4,
  perEntity = 2,
  /** Facts per entity already recalled this turn (from earlier interim transcripts). */
  usedThisTurn: ReadonlyMap<string, number> = new Map()
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
  // One entity can't take the whole turn ("sister" brought 4 pregnancy rows
  // and crowded out the hiking she was asked about, dev 2026-10-04).
  const perEntityCount = new Map<string, number>();
  const picked: RecallFact[] = [];
  for (const { fact } of scored) {
    const key = fact.entity.toLowerCase();
    const n = perEntityCount.get(key) ?? usedThisTurn.get(key) ?? 0;
    if (n >= perEntity) continue;
    perEntityCount.set(key, n + 1);
    picked.push(fact);
    if (picked.length >= max) break;
  }
  return picked;
}

/**
 * When a memory was said, for the note. "said" keeps it from reading as part
 * of the value: "deadline = due this Friday (today)" was read as the deadline
 * being today, and a Monday reply said "that deadline moved up to today"
 * (dev, 2026-10-05).
 */
function age(extractedAt: string | undefined, now: number): string {
  const t = extractedAt ? Date.parse(extractedAt) : NaN;
  if (Number.isNaN(t)) return '';
  const days = Math.floor((now - t) / 86_400_000);
  if (days < 1) return ' [said today]';
  if (days === 1) return ' [said yesterday]';
  return ` [said ${days} days ago]`;
}

export interface RecallExtras {
  /** Shared bits from past calls; shown only with INSIDE_JOKES=on. */
  insideJokes?: string[];
  env?: Record<string, string | undefined>;
}

/** A context note for the LLM, or null when there is nothing to recall. */
export function formatRecall(
  facts: RecallFact[],
  followUps: string[],
  userName?: string,
  now: number = Date.now(),
  extras: RecallExtras = {}
): string | null {
  const jokes = insideJokesEnabled(extras.env) ? (extras.insideJokes ?? []) : [];
  if (facts.length === 0 && followUps.length === 0 && jokes.length === 0) return null;
  const who = userName || 'them';
  const lines: string[] = [`[WHAT YOU REMEMBER ABOUT ${who.toUpperCase()}]`];
  for (const f of facts) {
    const subject = SELF_ENTITY.test(f.entity) ? who : f.entity;
    lines.push(`- ${subject}: ${f.key.replace(/_/g, ' ')} = ${f.value}${age(f.extractedAt, now)}`);
  }
  if (followUps.length > 0) {
    lines.push('Open threads from last time:');
    for (const item of followUps) lines.push(`- ${item}`);
  }
  if (jokes.length > 0) {
    lines.push(
      'Bits you two actually share from past calls. Bring one back only if it fits naturally, at most once this call, and never explain it:'
    );
    for (const joke of jokes) lines.push(`- ${joke}`);
  }
  lines.push(
    'These are from past calls, not this one. Use at most one, and only if it fits naturally, the way a friend who remembers would. ' +
      'Words like today, tomorrow or Friday inside a memory are as of when it was said. ' +
      "Anything a few days old or that could have changed, check instead of asserting (\"is she still...?\"). " +
      'Never bring up health, pregnancy, money or relationships unless they bring it up first. Never list them or say you looked it up.'
  );
  return lines.join('\n');
}

/** The slice of Firestore this module reads; injected so tests need no database. */
export interface RecallStore {
  facts(userId: string): Promise<Array<Record<string, unknown>>>;
  summaries(userId: string): Promise<Array<Record<string, unknown>>>;
}

const MAX_FACTS = 300;
/** Word confidences the extractor sometimes writes instead of numbers. */
const WORD_CONFIDENCE: Record<string, number> = { high: 0.9, medium: 0.6, low: 0.3 };
/** Facts the extractor itself marked low are left out of recall. */
const MIN_RECALL_CONFIDENCE = 0.4;

function confidenceOf(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') return WORD_CONFIDENCE[raw.trim().toLowerCase()] ?? 0.5;
  return 0.5;
}
const MAX_FOLLOW_UPS = 3;
const MAX_INSIDE_JOKES = 3;

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
    rawFacts
      .slice(0, MAX_FACTS)
      .map(
        (d): RecallFact => ({
          entity: String(d.entityName ?? ''),
          key: String(d.key ?? ''),
          value: String(d.value ?? ''),
          confidence: confidenceOf(d.confidence),
          ...(typeof d.extractedAt === 'string' ? { extractedAt: d.extractedAt } : {}),
        })
      )
      .filter((f) => f.confidence >= MIN_RECALL_CONFIDENCE)
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
  // Summaries come newest first, so these are the most recent bits.
  const insideJokes: string[] = [];
  for (const s of rawSummaries) {
    for (const item of Array.isArray(s.insideJokes) ? s.insideJokes : []) {
      if (typeof item !== 'string') continue;
      const text = item.trim();
      const seen = insideJokes.some((j) => j.toLowerCase() === text.toLowerCase());
      if (text && !seen) insideJokes.push(text);
      if (insideJokes.length >= MAX_INSIDE_JOKES) break;
    }
    if (insideJokes.length >= MAX_INSIDE_JOKES) break;
  }
  return { facts, followUps, insideJokes };
}
