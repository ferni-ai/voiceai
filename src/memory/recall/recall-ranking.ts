/**
 * Ranking for recalled facts: keyword overlap blended with semantic
 * similarity, under an item cap and a character budget.
 *
 * Keyword matching alone misses paraphrase ("my pup" vs "Biscuit: species =
 * dog"); embeddings alone surface loosely related noise. A fact is a candidate
 * when the user names its entity, shares content words with it, or is close in
 * meaning; candidates are then scored on all three plus confidence, recency
 * and whether the user confirmed it (userEdited). With no embeddings (no
 * provider, local dev, tests) ranking is keyword-only.
 *
 * @module memory/recall/recall-ranking
 */

/** Cosine similarity (local so ranking never loads the embedding stack or native modules). */
export function cosine(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

/** The entity the extractor uses for the caller themself. */
export const SELF_ENTITY = /^(speaker|user|me)$/i;

const STOPWORDS = new Set(
  "the and but for with that this was are you your have has had not just about what when where how who why can could would should will from they them their there then than into onto been being its it's i'm im my our out get got going really very some like know think well yeah okay also is".split(
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

export interface RankableFact {
  entity: string;
  key: string;
  value: string;
  confidence: number;
  /** Human-readable text (authoritative when the user edited the fact). */
  text?: string;
  userEdited?: boolean;
  updatedAtMs?: number;
}

export interface RankOptions {
  /** Max regular facts returned; matching user-edited facts come on top (up to as many again). */
  maxItems: number;
  /** Max characters of fact text returned. */
  maxChars: number;
  /** Let the best fact through even when it alone exceeds maxChars (default true). */
  firstAlwaysFits?: boolean;
  /** Embedding of the query, when available. */
  queryEmbedding?: number[] | null;
  /** Embedding per fact (keyed by the caller's id function). */
  factEmbedding?: (fact: RankableFact) => number[] | undefined;
  /** Cosine similarity at which a fact counts as related in meaning. */
  minSimilarity?: number;
  now?: number;
}

export interface Ranked<F> {
  fact: F;
  score: number;
  similarity?: number;
}

export const DEFAULT_MIN_SIMILARITY = 0.62;
const DAY_MS = 86_400_000;

/** How a fact reads in a recall note or tool result. */
export function displayText(fact: RankableFact, who = 'them'): string {
  if (fact.text && (fact.userEdited || !fact.key)) return fact.text;
  const subject = SELF_ENTITY.test(fact.entity) ? who : fact.entity;
  return `${subject}: ${fact.key.replace(/_/g, ' ')} = ${fact.value}`;
}

function matchText(fact: RankableFact): string {
  const useText = fact.userEdited || !fact.key;
  return [fact.entity, fact.key.replace(/_/g, ' '), fact.value, useText ? fact.text : '']
    .filter(Boolean)
    .join(' ');
}

/** Score one fact against a query; null when it is not relevant at all. */
export function scoreFact(
  fact: RankableFact,
  query: string,
  queryWords: ReadonlySet<string>,
  opts: Pick<RankOptions, 'queryEmbedding' | 'factEmbedding' | 'minSimilarity' | 'now'> = {}
): { score: number; similarity?: number } | null {
  const named = !SELF_ENTITY.test(fact.entity) && mentions(query, fact.entity);
  let overlap = 0;
  for (const w of contentWords(matchText(fact))) {
    if (queryWords.has(w)) overlap++;
  }
  let similarity: number | undefined;
  const qe = opts.queryEmbedding;
  const fe = qe ? opts.factEmbedding?.(fact) : undefined;
  if (qe && fe && fe.length === qe.length) similarity = cosine(qe, fe);
  const minSim = opts.minSimilarity ?? DEFAULT_MIN_SIMILARITY;
  const semantic = similarity !== undefined && similarity >= minSim;
  if (!named && overlap === 0 && !semantic) return null;

  const ageDays = fact.updatedAtMs
    ? Math.max(0, ((opts.now ?? Date.now()) - fact.updatedAtMs) / DAY_MS)
    : 365;
  const recency = 0.3 * Math.exp(-ageDays / 30);
  const semanticScore =
    semantic && similarity !== undefined ? ((similarity - minSim) / (1 - minSim)) * 2 + 0.5 : 0;
  const score =
    (named ? 2 : 0) +
    overlap * 0.5 +
    semanticScore +
    fact.confidence * 0.5 +
    recency +
    (fact.userEdited ? 0.5 : 0);
  return { score, similarity };
}

/**
 * Rank facts for a query: relevant ones only, best first, user-edited matches
 * guaranteed, then capped by item count and character budget.
 */
export function rankFacts<F extends RankableFact>(
  facts: readonly F[],
  query: string,
  opts: RankOptions,
  textOf: (f: F) => string = (f) => displayText(f)
): Array<Ranked<F>> {
  const words = contentWords(query);
  const scored: Array<Ranked<F>> = [];
  for (const fact of facts) {
    const s = scoreFact(fact, query, words, opts);
    if (s) scored.push({ fact, score: s.score, similarity: s.similarity });
  }
  scored.sort((a, b) => b.score - a.score);

  const out: Array<Ranked<F>> = [];
  let chars = 0;
  // User-confirmed facts that match always come along (up to maxItems of them),
  // on top of the regular facts' cap.
  for (const r of scored) {
    if (!r.fact.userEdited || out.length >= opts.maxItems) continue;
    out.push(r);
    chars += textOf(r.fact).length;
  }
  let regular = 0;
  for (const r of scored) {
    if (r.fact.userEdited) continue;
    if (regular >= opts.maxItems) break;
    const len = textOf(r.fact).length;
    const exempt = out.length === 0 && opts.firstAlwaysFits !== false;
    if (!exempt && chars + len > opts.maxChars) continue;
    out.push(r);
    chars += len;
    regular++;
  }
  return out.sort((a, b) => b.score - a.score);
}
