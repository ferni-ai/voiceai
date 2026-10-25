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

import type { InsideJokeRef } from '../../types/profile/inside-joke.js';
import { insideJokesEnabled } from './inside-jokes-recall.js';
import { lineKey } from '../operations/inside-jokes.js';
import { foldedWords, legacyForgetTokens, stem } from './forget-tokens.js';
import { MIN_WEIGHTED_OVERLAP, rareWordsEnabled, weighWords } from './rare-words.js';
export { rareWordsEnabled } from './rare-words.js';

import { flagOn } from '../../config/env-flag.js';

export interface RecallFact {
  entity: string;
  key: string;
  value: string;
  confidence: number;
  /** When it was extracted (ISO), so Ferni knows how old the memory is. */
  extractedAt?: string;
  /** The extractor's kind (relationship, event, state...) and when it holds ("next week"). */
  factType?: string;
  temporalContext?: string;
  /** When a newer fact replaced it (fact-supersession.ts): how things were, not how they are. */
  supersededAt?: string;
}

export interface RecallSnapshot {
  facts: RecallFact[];
  /** Open threads from recent sessions ("ask how the vet visit went"). */
  followUps: string[];
  /** With RECALL_RARE_WORDS=on: how much a shared word counts (rareWordWeights). */
  wordWeights?: ReadonlyMap<string, number>;
  /** Bits that were genuinely funny between them on recent calls, each with its line (summaries' insideJokes). */
  insideJokes?: InsideJokeRef[];
}

export const EMPTY_SNAPSHOT: RecallSnapshot = { facts: [], followUps: [], insideJokes: [] };

/**
 * RECALL_BRIDGE=on (off by default): open threads from earlier calls wait for
 * a turn they fit, and the note says how to bring one up. On a dev call
 * (2026-10-11) the caller answered the greeting with "Still on there." and
 * Ferni's next line was "That mail isn't going to clear itself, but honestly
 * mine's still sitting right where it was this morning too": a thread from an
 * earlier call, dropped in as if it carried on a thought, next to his own life.
 */
export function recallBridgeEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return flagOn('RECALL_BRIDGE', env);
}

/** The entity the extractor uses for the caller themself. */
const SELF_ENTITY = /^(speaker|user|me)$/i;

const STOPWORDS = new Set(
  "the and but for with that this was are you your have has had not just about what when where how who why can could would should will from they them their there then than into onto been being its it's i'm im my our out get got going really very some like know think well yeah okay also".split(
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

/** Rarity weights for the caller's facts (rare-words.ts, RECALL_RARE_WORDS). */
export function rareWordWeights(facts: readonly RecallFact[]): Map<string, number> | undefined {
  return weighWords(facts, contentWords);
}

/** Words that say nothing about what to forget: "forget what I said about that". */
const FORGET_FILLER = new Set(
  'forget forgot forgotten remember said say saying told tell talked talk mentioned thing things stuff part bit please user speaker'.split(
    ' '
  )
);

/**
 * The words of a forget request or a memory, for matching one to the other:
 * lower case, two letters or more ("my ex"), plural "s" dropped, stopwords
 * and filler left out, and a number written with spaces or dashes kept as
 * one ("555-123-4567" = "5551234567").
 */
export function forgetTokens(text: string): string[] {
  const out = topicWords(text).map((w) => (w.plain ? w.word : stem(w.word)));
  return [...new Set(out)];
}

const isTopicWord = (w: string) => w.length >= 2 && !STOPWORDS.has(w) && !FORGET_FILLER.has(w);

function topicWords(text: string): Array<{ word: string; plain: boolean }> {
  return foldedWords(text).filter((w) => isTopicWord(w.word));
}

/**
 * A topic as stored (forget.ts): its words with their case (so a name stays
 * a name when read back), filler left out. "Forget my sister's wedding" ->
 * "sister wedding"; "James" -> "James".
 */
export function storedTopic(topic: string): string {
  const words = topic.match(/\S+/g) ?? [];
  return words
    .filter((w) => topicWords(w).length > 0)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .join(' ');
}

const LEGACY_SKIP: ReadonlySet<string> = new Set([...STOPWORDS, ...FORGET_FILLER]);

/**
 * True when `text` is about a topic the caller asked to forget (forget.ts):
 * every word of the topic appears in it as a whole word. Erring toward
 * leaving a memory out is the right side for a privacy request.
 */
export function isForgotten(text: string, topics: readonly string[]): boolean {
  if (topics.length === 0) return false;
  const words = new Set(forgetTokens(text));
  // "ex wife" in a memory is the "ex-wife" / "exwife" of a request, and back.
  const raw = foldedWords(text).map((w) => w.word);
  for (let i = 0; i + 1 < raw.length; i++) words.add(stem(`${raw[i]}${raw[i + 1]}`));
  // A capitalized word in a memory is often just a sentence's first word
  // ("Divorce papers came"): it matches stemmed too. A topic's name never
  // stems, so forgetting "James" can't hide "jam".
  for (const w of raw) {
    if (!isTopicWord(w)) continue;
    words.add(w); // a name kept whole in a topic ("Charles") matches "charles"
    words.add(stem(w));
  }
  let legacy: Set<string> | undefined;
  return topics.some((t) => {
    const want = forgetTokens(t);
    if (want.length > 0) {
      if (want.every((w) => words.has(w))) return true;
      if (want.length > 1 && want.length <= 3 && words.has(stem(want.join('')))) return true;
    }
    // A topic stored by the tokenizer before 2026-10-11 ("zo" for "Zoë",
    // "babie" for "babies") still hides what it hid then.
    const stored = t.toLowerCase().split(/\s+/).filter(Boolean);
    legacy ??= new Set(legacyForgetTokens(text, LEGACY_SKIP));
    return stored.length > 0 && stored.every((w) => legacy!.has(w));
  });
}

export function factId(f: RecallFact): string {
  return `${f.entity}|${f.key}|${f.value}`.toLowerCase();
}

/** Semantic matches for this turn (semantic-recall.ts), when SEMANTIC_RECALL is on. */
export interface RecallBlend {
  /** factId to how far its similarity stood above the median. */
  semantic: ReadonlyMap<string, number>;
  now: number;
  /**
   * Only facts whose entity they named: an interim transcript before the
   * turn's embedding lands, so loose word matches don't spend the turn.
   */
  namedOnly?: boolean;
}

/** A margin of 0.2 (a clear match) weighs as much as naming the entity. */
const SEMANTIC_WEIGHT = 10;
/** A replaced fact ranks as if it shared two fewer words with the turn. */
const SUPERSEDED_PENALTY = 1;
/** Newer memories edge out older ones: +0.5 today, +0.18 a month ago. */
const RECENCY_WEIGHT = 0.5;
const RECENCY_DAYS = 30;

function recency(extractedAt: string | undefined, now: number): number {
  const t = extractedAt ? Date.parse(extractedAt) : NaN;
  if (Number.isNaN(t)) return 0;
  return RECENCY_WEIGHT * Math.exp(-Math.max(0, now - t) / 86_400_000 / RECENCY_DAYS);
}

/**
 * The facts worth bringing to this turn, best first.
 *
 * A fact is relevant when the user names its entity, or shares content words
 * with it, or (with a blend) means something close to what they said. Facts
 * already surfaced this session are skipped so Ferni does not keep repeating
 * the same recollection.
 */
export function recallForTurn(
  snapshot: RecallSnapshot,
  userText: string,
  surfaced: ReadonlySet<string> = new Set(),
  max = 4,
  perEntity = 2,
  /** Facts per entity already recalled this turn (from earlier interim transcripts). */
  usedThisTurn: ReadonlyMap<string, number> = new Map(),
  blend?: RecallBlend
): RecallFact[] {
  const words = contentWords(userText);
  const scored: Array<{ fact: RecallFact; score: number }> = [];
  for (const fact of snapshot.facts) {
    const id = factId(fact);
    if (surfaced.has(id)) continue;
    const named = !SELF_ENTITY.test(fact.entity) && mentions(userText, fact.entity);
    let overlap = 0;
    for (const w of contentWords(`${fact.entity} ${fact.key} ${fact.value}`)) {
      if (words.has(w)) overlap += snapshot.wordWeights?.get(w) ?? 1;
    }
    if (snapshot.wordWeights && overlap < MIN_WEIGHTED_OVERLAP) overlap = 0;
    const margin = blend?.semantic.get(id) ?? 0;
    if (!named && (blend?.namedOnly || (overlap === 0 && margin === 0))) continue;
    let score = (named ? 2 : 0) + overlap * 0.5 + fact.confidence * 0.5;
    // Replaced facts stay findable ("where did I work before?") but yield to current ones.
    if (fact.supersededAt) score -= SUPERSEDED_PENALTY;
    if (blend) score += margin * SEMANTIC_WEIGHT + recency(fact.extractedAt, blend.now);
    scored.push({ fact, score });
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
  insideJokes?: InsideJokeRef[];
  env?: Record<string, string | undefined>;
  /** RECALL_BRIDGE: say how to bring an open thread up. */
  bridge?: boolean;
}

/** How to raise an open thread (RECALL_BRIDGE). */
export const THREAD_BRIDGE =
  'These open threads are from earlier calls. Answer what they just said first. ' +
  'If you bring one up, make it clearly from last time ("last time you mentioned the mail, how\'d that go?"), ' +
  'never as if it were part of this call or carried on what you were saying, ' +
  'and never in the same breath as something about your own life.';

/**
 * Words a greeting, a check-in or an ack is made of. A turn made only of these
 * is not about anything yet; they also never count as a match with a thread.
 */
const SMALL_TALK = new Set(
  `hey hi hello hiya yo howdy morning afternoon evening good great fine okay ok alright all right
  not bad too much nothing doing going how how's are you you're thanks thank still there here
  yeah yep yes nope sure cool nice well pretty hanging hangin feeling vibe today tonight
  ferni man buddy friend again back on it it's i'm im just so and the a um uh hmm mhm oh ah`
    .split(/\s+/)
    .filter(Boolean)
);

/** "What's new?", "anything going on?": the caller hands over the topic. */
const OPEN_QUESTION =
  /\b(?:what'?s|what is|anything) (?:new|going on|happening|up with you|been going on)\b|\bcatch me up\b|\bwhat (?:should|do you want to) (?:we )?talk about\b/i;

/** A greeting, a short check-in (four words or fewer) or an ack: not about anything yet. */
export function onlySmallTalk(text: string): boolean {
  const words = text.toLowerCase().match(/[a-z][a-z']*/g) ?? [];
  return words.length <= 4 || words.every((w) => SMALL_TALK.has(w));
}

/**
 * RECALL_BRIDGE: which of the open threads still to offer fit this turn.
 * All of them once the caller says something of substance or asks an open
 * question, and on their third turn at the latest; before that, only a thread
 * that shares a word with what they said ("the mail" when they mention mail).
 */
export function threadsForTurn(threads: string[], text: string, callerTurn: number): string[] {
  if (threads.length === 0) return [];
  if (callerTurn >= 3 || OPEN_QUESTION.test(text) || !onlySmallTalk(text)) return threads;
  const said = [...contentWords(text)].filter((w) => w.length >= 3 && !SMALL_TALK.has(w));
  if (said.length === 0) return [];
  return threads.filter((t) => {
    const words = contentWords(t);
    return said.some((w) => words.has(w));
  });
}

/** How to use what recall picked: the rule every memory note carries. CONTEXT_PACKET uses it verbatim. */
export const RECALL_RULE =
  'These are from past calls, not this one. Use at most one, and only if it fits naturally, the way a friend who remembers would. ' +
  'Words like today, tomorrow or Friday inside a memory are as of when it was said. ' +
  'Anything a few days old or that could have changed, check instead of asserting ("is she still...?"). ' +
  'Never bring up health, pregnancy, money or relationships unless they bring it up first. Never list them or say you looked it up.';

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
    // "baker at Rise and Grind" read as his job after he'd moved to Northwind (benchmark, 2026-10-11).
    const was = f.supersededAt ? ' [no longer true: how things were before]' : '';
    lines.push(
      `- ${subject}: ${f.key.replace(/_/g, ' ')} = ${f.value}${age(f.extractedAt, now)}${was}`
    );
  }
  if (followUps.length > 0) {
    lines.push(extras.bridge ? 'Open threads from earlier calls:' : 'Open threads from last time:');
    for (const item of followUps) lines.push(`- ${item}`);
    if (extras.bridge) lines.push(THREAD_BRIDGE);
  }
  if (jokes.length > 0) {
    lines.push(
      'Bits you two actually share from past calls. Bring one back only if it fits naturally, at most once this call, and never explain it:'
    );
    for (const joke of jokes) lines.push(`- ${joke.bit}`);
  }
  lines.push(RECALL_RULE);
  return lines.join('\n');
}

/** The slice of Firestore this module reads; injected so tests need no database. */
export interface RecallStore {
  facts(userId: string): Promise<Array<Record<string, unknown>>>;
  summaries(userId: string): Promise<Array<Record<string, unknown>>>;
  /** Topics the caller asked to forget (forget.ts); nothing about them is recalled. */
  forgotten?(userId: string): Promise<string[] | null>;
}

const MAX_FACTS = 300;
/** Word confidences the extractor sometimes writes instead of numbers. */
const WORD_CONFIDENCE: Record<string, number> = { high: 0.9, medium: 0.6, low: 0.3 };
/** Facts the extractor itself marked low are left out of recall. */
const MIN_RECALL_CONFIDENCE = 0.4;

export function confidenceOf(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') return WORD_CONFIDENCE[raw.trim().toLowerCase()] ?? 0.5;
  return 0.5;
}
export const MAX_FOLLOW_UPS = 3;
const MAX_INSIDE_JOKES = 3;

/** Set on a summary whose items were checked against the caller's lines (caller-assertions.ts). */
export const CALLER_PROVENANCE = 1;
const LABELLED = ['disputedItems', 'assistantRaisedItems'];

/**
 * A summary without the items the caller disputed (dispute.ts: disputedItems) or that
 * only the assistant said (assistantRaisedItems), and without those lists, so no reader
 * serves or matches them.
 */
export function undisputed(s: Record<string, unknown>): Record<string, unknown> {
  const gone = new Set(LABELLED.flatMap((k) => (Array.isArray(s[k]) ? s[k].map(String) : [])));
  if (!LABELLED.some((k) => k in s)) return s;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) {
    if (LABELLED.includes(k)) continue;
    out[k] = Array.isArray(v) ? v.filter((x) => typeof x !== 'string' || !gone.has(x)) : v;
  }
  return out;
}

/** Load a user's recall snapshot. Never throws; an unreachable store yields an empty snapshot. */
export async function loadRecallSnapshot(
  store: RecallStore,
  userId: string,
  maxFollowUps = MAX_FOLLOW_UPS
): Promise<RecallSnapshot> {
  const [rawFacts, rawSummaries, forgotten] = await Promise.all([
    store.facts(userId).catch(() => []),
    store
      .summaries(userId)
      .then((all) => all.map(undisputed))
      .catch(() => []),
    store.forgotten
      ? store.forgotten(userId).catch((): null => null)
      : Promise.resolve<string[]>([]),
  ]);
  // Topics that can't be read: nothing that might be about one is recalled
  // (fails closed, like episode quotes). Facts, threads and jokes alike.
  if (forgotten === null) return { facts: [], followUps: [], insideJokes: [] };
  const facts = dedupeFacts(
    rawFacts
      // Marked by forget.ts, or a miss the caller corrected (friend-repair.ts): kept, never recalled.
      .filter((d) => typeof d.forgottenAt !== 'string' && typeof d.correctedAt !== 'string')
      .slice(0, MAX_FACTS)
      .map((d): RecallFact => ({
        entity: String(d.entityName ?? ''),
        key: String(d.key ?? ''),
        value: String(d.value ?? ''),
        confidence: confidenceOf(d.confidence),
        ...(typeof d.extractedAt === 'string' ? { extractedAt: d.extractedAt } : {}),
        ...(typeof d.factType === 'string' ? { factType: d.factType } : {}),
        ...(typeof d.temporalContext === 'string' ? { temporalContext: d.temporalContext } : {}),
        ...(typeof d.supersededAt === 'string' ? { supersededAt: d.supersededAt } : {}),
      }))
      .filter((f) => f.confidence >= MIN_RECALL_CONFIDENCE)
      .filter((f) => !isForgotten(`${f.entity} ${f.key} ${f.value}`, forgotten))
  );
  const followUps: string[] = [];
  for (const s of rawSummaries) {
    // A thread is theirs only if the summary checked it against their own lines
    if (s.callerProvenance !== CALLER_PROVENANCE) continue;
    for (const item of Array.isArray(s.followUpItems) ? s.followUpItems : []) {
      const text = String(item).trim();
      if (text && !followUps.includes(text) && !isForgotten(text, forgotten)) followUps.push(text);
      if (followUps.length >= maxFollowUps) break;
    }
    if (followUps.length >= maxFollowUps) break;
  }
  // Summaries come newest first, so these are the most recent bits. Only a bit
  // with its line on file counts; bare strings from older summaries don't.
  const insideJokes: InsideJokeRef[] = [];
  for (const s of rawSummaries) {
    for (const item of Array.isArray(s.insideJokes) ? s.insideJokes : []) {
      if (!item || typeof item !== 'object') continue;
      const { bit, quote, speaker } = item as Partial<InsideJokeRef>;
      if (typeof bit !== 'string' || typeof quote !== 'string') continue;
      if (speaker !== 'user' && speaker !== 'assistant') continue;
      if (quote.trim().split(/\s+/).length < 3) continue;
      const text = bit.trim();
      const seen = insideJokes.some(
        (j) => j.bit.toLowerCase() === text.toLowerCase() || lineKey(j.quote) === lineKey(quote)
      );
      // A forgotten topic keeps a bit out whether it's in the bit's words or its line.
      if (text && !seen && !isForgotten(`${text} ${quote}`, forgotten))
        insideJokes.push({ bit: text, quote: quote.trim(), speaker });
      if (insideJokes.length >= MAX_INSIDE_JOKES) break;
    }
    if (insideJokes.length >= MAX_INSIDE_JOKES) break;
  }
  return {
    facts,
    followUps,
    insideJokes,
    ...(rareWordsEnabled() && { wordWeights: rareWordWeights(facts) }),
  };
}
