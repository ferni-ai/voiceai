/**
 * When the caller denies something Ferni just brought up from memory, recall
 * stops serving it.
 *
 * Seth's prod call (2026-10-12): a dev call misheard him ("Night Owl's
 * contracts"), the summary kept "working late on contracts" and a follow-up
 * "How did the contract wrangling turn out?", and on the next call Peter asked
 * "How did those contracts end up looking?". Seth said "What contracts?". The
 * false memory stayed, and was served again.
 *
 * Two shapes are read, each only against the reply just before it, and only
 * when that reply was about the caller ("you", "your"):
 * - an echo question naming the thing: "What contracts?" after a reply that
 *   mentions contracts. What is disputed: the caller's facts about it.
 * - a plain denial: "I never said that", "No, that's wrong", "That never
 *   happened". What is disputed: facts sharing at least two words with the
 *   reply.
 * Summary items about it (follow-ups, key points, topics, open threads,
 * inside jokes) are disputed the same way.
 *
 * A denial means "that memory is wrong", not "never bring this up": only the
 * matched items are marked, never the forgotten-topics list (that is for
 * explicit forgets), so a later true "I'm signing contracts with Acme" is
 * remembered as usual. Facts are marked forgottenAt (forget.ts: out of recall,
 * their index copies removed, dropped by source in vector search) plus
 * disputedAt; summaries get disputedItems, which recall skips and which drops
 * the summary's vector copy (forget-filter.ts). Nothing is deleted. A match
 * over a few facts is refused (too broad to be the one Ferni got wrong).
 *
 * Not fact supersession (fact-supersession.ts): recall keeps a replaced fact
 * as "how things were before", and a denied memory was never true.
 *
 * @module memory/recall/dispute
 */
import { createLogger } from '../../utils/safe-logger.js';
import { factText, type StoredFactRef } from './forget.js';
import { forgetTokens, isForgotten, storedTopic } from './session-recall.js';
import { isMemberIdentity } from '../../services/identity/member-identity.js';

const log = createLogger({ module: 'dispute' });

/** "What contracts?", "Which contracts", "What contracts are you talking about?" */
const ECHO =
  /^\s*(?:what|which)\s+((?:the\s+|those\s+|these\s+)?[a-z][a-z'-]*(?:\s+[a-z][a-z'-]*){0,2}?)(?:\s+are you talking about)?\s*\??\s*$/i;
const DENIAL =
  /\b(?:i never said that|i didn'?t say that|that'?s (?:not right|wrong|not true)|that never happened|where did you get that)\b/i;
/** Words that carry no topic of their own (forgetTokens keeps short function words). */
const NOT_TOPIC = new Set(
  'about also been does doing else from have just kind last like make much night only really said still thing things time today very what when where which with your youre'.split(
    ' '
  )
);
/** An echo starting with one of these is a question about the reply, not a thing in memory. */
const NOT_NOUN =
  /^(?:is|are|was|were|do|does|did|can|could|would|will|should|have|has|about|if|kind|time|else)\b/;

/** The words of `text` that name something: four letters or more, not filler. */
function topicWordsOf(text: string): string[] {
  return forgetTokens(text).filter((w) => w.length >= 4 && !NOT_TOPIC.has(w));
}

const ABOUT_CALLER = /\byou(?:r|'re|'ve|'d)?\b/i;
/** More facts than this for one denial is not the one Ferni got wrong. */
const MAX_DISPUTED = 5;
/** Nor this many summary items. */
const MAX_DISPUTED_ITEMS = 8;
/** Summary fields whose string items recall serves. */
export const SUMMARY_ITEM_FIELDS = [
  'followUpItems',
  'keyPoints',
  'mainTopics',
  'questionsRemaining',
  'insideJokes',
] as const;

export type Denial = { kind: 'echo'; topic: string } | { kind: 'denial'; words: string[] };

/** The denial in the caller's line, if it answers the reply just before it. */
export function denialOf(callerLine: string, previousReply: string): Denial | null {
  if (!ABOUT_CALLER.test(previousReply)) return null;
  const echo = ECHO.exec(callerLine);
  if (echo?.[1]) {
    const topic = echo[1]
      .toLowerCase()
      .replace(/^(?:the|those|these)\s+/, '')
      .trim();
    if (NOT_NOUN.test(topic)) return null;
    const asked = topicWordsOf(topic);
    const said = new Set(topicWordsOf(previousReply));
    return asked.length > 0 && asked.every((w) => said.has(w)) ? { kind: 'echo', topic } : null;
  }
  if (DENIAL.test(callerLine)) {
    const words = topicWordsOf(previousReply);
    return words.length >= 2 ? { kind: 'denial', words } : null;
  }
  return null;
}

export type DisputeResult =
  | { kind: 'disputed'; facts: number; items: number }
  | { kind: 'too-broad'; matched: number }
  | { kind: 'nothing' };

export interface StoredSummaryRef {
  id: string;
  data: Record<string, unknown>;
}

export interface DisputeStore {
  /** The caller's facts in every fact collection (forget.ts). */
  facts: (userId: string) => Promise<StoredFactRef[]>;
  /** The caller's recent call summaries. */
  summaries: (userId: string) => Promise<StoredSummaryRef[]>;
  markFacts: (userId: string, refs: StoredFactRef[], at: string) => Promise<void>;
  markSummaryItems: (userId: string, id: string, items: string[], at: string) => Promise<void>;
}

/** What a denial covers: a text about the echoed topic, or sharing two words with the reply. */
function matcher(denial: Denial): (text: string) => boolean {
  if (denial.kind === 'echo') {
    const topic = storedTopic(denial.topic);
    return (text) => isForgotten(text, [topic]);
  }
  const reply = new Set(denial.words);
  return (text) => topicWordsOf(text).filter((w) => reply.has(w)).length >= 2;
}

/** A summary's items that a denial covers and that aren't disputed yet. */
function disputedItemsOf(data: Record<string, unknown>, covers: (t: string) => boolean): string[] {
  const done = new Set(Array.isArray(data.disputedItems) ? data.disputedItems.map(String) : []);
  return SUMMARY_ITEM_FIELDS.flatMap((field) => {
    const items: unknown = data[field];
    return Array.isArray(items) ? items.filter((x): x is string => typeof x === 'string') : [];
  }).filter((item) => !done.has(item) && covers(item));
}

/** Marks what the caller disputed. Throws only if the store does. Firestore: storage/dispute-store.ts. */
export async function disputeDenied(
  userId: string,
  denial: Denial,
  store: DisputeStore,
  now: Date = new Date()
): Promise<DisputeResult> {
  const covers = matcher(denial);
  const [facts, summaries] = await Promise.all([store.facts(userId), store.summaries(userId)]);
  const matched = facts.filter(
    (f) => typeof f.data.forgottenAt !== 'string' && covers(factText(f.data))
  );
  const items = summaries
    .map((s) => ({ id: s.id, items: disputedItemsOf(s.data, covers) }))
    .filter((s) => s.items.length > 0);
  const itemCount = items.reduce((n, s) => n + s.items.length, 0);
  if (matched.length > MAX_DISPUTED) return { kind: 'too-broad', matched: matched.length };
  if (itemCount > MAX_DISPUTED_ITEMS) return { kind: 'too-broad', matched: itemCount };
  if (matched.length === 0 && itemCount === 0) return { kind: 'nothing' };
  const at = now.toISOString();
  if (matched.length > 0) await store.markFacts(userId, matched, at);
  for (const s of items) await store.markSummaryItems(userId, s.id, s.items, at);
  return { kind: 'disputed', facts: matched.length, items: itemCount };
}

/** Reads the caller's line against the reply before it and disputes what it denies. Never throws. */
export async function disputeForCaller(
  userId: string | undefined,
  callerLine: string,
  previousReply: string,
  store: DisputeStore
): Promise<DisputeResult> {
  if (!isMemberIdentity(userId)) return { kind: 'nothing' };
  const denial = denialOf(callerLine, previousReply);
  if (!denial) return { kind: 'nothing' };
  try {
    const result = await disputeDenied(userId, denial, store);
    log.info(
      { userId: userId.slice(0, 8), kind: denial.kind, result: result.kind },
      'Caller disputed a memory'
    );
    return result;
  } catch (error: unknown) {
    log.warn({ error: String(error) }, 'Could not mark a disputed memory');
    return { kind: 'nothing' };
  }
}
