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
 *   mentions contracts. The topic is disputed the way a forget request is
 *   (forget.ts: facts marked, topic recorded, so call summaries and their
 *   follow-ups about it are left out too). Nothing is deleted.
 * - a plain denial: "I never said that", "No, that's wrong", "That never
 *   happened". There's no single topic, so the caller's facts sharing at least
 *   two words with the reply are marked; no topic is recorded.
 * Both refuse a match covering more than a few facts (too broad to be the one
 * Ferni got wrong).
 *
 * Not fact supersession (fact-supersession.ts): recall keeps a replaced fact
 * as "how things were before", and a denied memory was never true.
 *
 * @module memory/recall/dispute
 */
import { createLogger } from '../../utils/safe-logger.js';
import { factText, firestoreForgetStore, forgetTopic, type ForgetStore } from './forget.js';
import { forgetTokens, isForgotten, storedTopic } from './session-recall.js';

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
  | { kind: 'disputed'; marked: number }
  | { kind: 'too-broad'; matched: number }
  | { kind: 'nothing' };

/** Marks what the caller disputed. Throws only if the store does. */
export async function disputeDenied(
  userId: string,
  denial: Denial,
  store: ForgetStore = firestoreForgetStore,
  now: Date = new Date()
): Promise<DisputeResult> {
  const live = (await store.facts(userId)).filter((f) => typeof f.data.forgottenAt !== 'string');
  if (denial.kind === 'echo') {
    const topic = storedTopic(denial.topic);
    const matched = live.filter((f) => isForgotten(factText(f.data), [topic])).length;
    if (matched > MAX_DISPUTED) return { kind: 'too-broad', matched };
    const result = await forgetTopic(userId, denial.topic, store, now);
    if (result.kind === 'forgotten') return { kind: 'disputed', marked: result.marked };
    return result.kind === 'too-broad' ? result : { kind: 'nothing' };
  }
  const reply = new Set(denial.words);
  const matched = live.filter(
    (f) => topicWordsOf(factText(f.data)).filter((w) => reply.has(w)).length >= 2
  );
  if (matched.length === 0) return { kind: 'nothing' };
  if (matched.length > MAX_DISPUTED) return { kind: 'too-broad', matched: matched.length };
  await store.markForgotten(userId, matched, now.toISOString());
  return { kind: 'disputed', marked: matched.length };
}

/** Reads the caller's line against the reply before it and disputes what it denies. Never throws. */
export async function disputeForCaller(
  userId: string | undefined,
  callerLine: string,
  previousReply: string,
  store: ForgetStore = firestoreForgetStore
): Promise<DisputeResult> {
  if (!userId || userId === 'anonymous') return { kind: 'nothing' };
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
