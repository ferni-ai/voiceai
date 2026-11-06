/**
 * What Ferni has already said word for word on a call: any sentence two of
 * his recent replies said alike, so the next reply doesn't say it a third
 * time (ALREADY_SAID_LEDGER=on, off by default).
 *
 * The told-this-call record (told-this-call.ts) quotes a sentence only when it
 * shares a six-word run with another reply or runs eight words or more, and
 * PHRASE_LOOP_GUARD (phrase-loops.ts) names a stock phrase only once two
 * replies have said it. A short line said again and again ("That's a big
 * step.", in three replies running) is never quoted.
 *
 * The ledger reads Ferni's own lines only, never the caller's: every sentence
 * that two of his last `replyWindow` replies said alike once case,
 * punctuation and markup are normalised. Older replies have expired. A line
 * said once is never named, nor is a question, a short confirmation ("Okay,
 * got it.") or a sign-off ("Talk soon, take care of yourself."): those are
 * how people talk, not a tic. When the caller asks him to say it again
 * (`asksAgain`, read from their turn and never kept), there is no ledger that turn. Nothing he says is rewritten (a streamed reply
 * can't be, without cutting words): `caught` only marks, for the log, that
 * his newest reply repeated a sentence.
 *
 * Crisis, safety and notice wording stays word for word. The whole window
 * goes unread when any reply in it touches safety, harm or help, or gives a
 * way to reach help: a crisis or help line in digits or words, or the
 * emergency services (services/safety/safety-talk.ts reachesHelp). An
 * ordinary number ("$120", "room 204") leaves the window read. A sentence of
 * the safety scripts, any safety talk (isSafetyTalk: care wording, a means or
 * grounding line), a notice (an AI disclosure, what is kept, logged or
 * remembered, an advice disclaimer) or a sentence with a number is never
 * named. Once a call has crisis risk noted, the note carries no
 * ledger at all (told-this-call.ts keptTold).
 *
 * @module agents/personas/already-said
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import { isSafetyTalk, reachesHelp } from '../../services/safety/safety-talk.js';
import { createLogger } from '../../utils/safe-logger.js';
import { ferniSaysGoodbye } from '../shared/call-farewell.js';
import { mentionsCrisisResource } from './listen-offer.js';
import { contentWords, isSafetyLine, isSafetyTopic, normalized } from './phrase-loops.js';

const log = createLogger({ module: 'AlreadySaid' });

/** Every setting of the ledger, in one place. */
export const ALREADY_SAID = {
  flag: 'ALREADY_SAID_LEDGER',
  /** Ferni's latest replies the ledger reads; anything before them has expired. */
  replyWindow: 6,
  /** Replies, of the window, that must have said a sentence alike before it is named. */
  minReplies: 2,
  /** A sentence with fewer content words ("Okay, got it.", "Sounds good.") is never named. */
  minContentWords: 2,
  /** Sentences one note names at most. */
  maxPhrases: 3,
  maxQuoteChars: 80,
} as const;

export function alreadySaidLedgerOn(env: Env = process.env): boolean {
  return flagOn(ALREADY_SAID.flag, env);
}

export interface AlreadySaid {
  /** Sentences two or more replies in the window said alike, as first said, most replies first. */
  repeated: string[];
  /** The newest reply said a sentence an earlier reply in the window had said. */
  caught: boolean;
}

const NONE: AlreadySaid = { repeated: [], caught: false };

/** Notices said as written: an AI disclosure, what is kept or remembered, an advice disclaimer. */
const NOTICE =
  /\b(?:ai|bots?|artificial|not a (?:real )?(?:person|human)|recorded|recording|logg(?:ed|ing)|transcri\w*|keep\w*|kept|remember\w*|sav(?:e|ed|es|ing)|stor(?:e|ed|es|ing)|shared?|delete\w*|(?:medical|legal|financial) advice|not a (?:doctor|lawyer|therapist|counsel(?:or|lor))|consent\w*|okay before)\b/i;

/** The caller asks Ferni to say it again: repeating is the answer, so no ledger that turn. */
const ASKS_AGAIN =
  /\b(?:say (?:that|it) again|repeat (?:that|it|yourself)|what was that|come again|what(?: did|'?d) you (?:just )?(?:say|add|put)|didn'?t (?:quite )?(?:catch|hear) (?:that|you|it)|missed (?:that|it)|one more time|pardon)\b|\b(?:huh|sorry|what)\s*\?|^\W*(?:(?:wait|sorry|um|uh),?\s+)?(?:huh|sorry|what|excuse me)\W*$/i;

export const asksAgain = (callerSaid: string): boolean => ASKS_AGAIN.test(callerSaid);

/** A reply the ledger must not read at all: on safety, a crisis resource, or a number to reach. */
const touchesSafety = (reply: readonly string[]): boolean =>
  mentionsCrisisResource(reply.join(' ')) || reply.some((s) => isSafetyTopic(s) || reachesHelp(s));

/** A sentence as compared: markup gone, then lowercase words only. */
const keyOf = (sentence: string): string => normalized(sentence.replace(/<[^>]+>/g, ' '));

const nameable = (sentence: string): boolean =>
  !sentence.trimEnd().endsWith('?') &&
  contentWords(keyOf(sentence)).length >= ALREADY_SAID.minContentWords &&
  !isSafetyLine(sentence) &&
  !NOTICE.test(sentence) &&
  !isSafetyTalk(sentence) &&
  !/\d/.test(sentence) &&
  !ferniSaysGoodbye(sentence);

/** The ledger from Ferni's replies so far, each as its sentences, oldest first. */
export function alreadySaid(replies: ReadonlyArray<readonly string[]>): AlreadySaid {
  const window = replies.slice(-ALREADY_SAID.replyWindow);
  if (window.some(touchesSafety)) return NONE;
  const said = new Map<string, { first: string; replies: number }>();
  for (const reply of window) {
    const keys = new Set<string>();
    for (const sentence of reply.filter(nameable)) {
      const key = keyOf(sentence);
      if (keys.has(key)) continue;
      keys.add(key);
      const seen = said.get(key);
      if (seen) seen.replies += 1;
      else said.set(key, { first: sentence, replies: 1 });
    }
  }
  const again = (s: { replies: number }): boolean => s.replies >= ALREADY_SAID.minReplies;
  const repeated = [...said.values()]
    .filter(again)
    .sort((a, b) => b.replies - a.replies)
    .map((s) => s.first);
  const newest = window.at(-1) ?? [];
  const caught = newest.some((s) => {
    const seen = said.get(keyOf(s));
    return seen !== undefined && again(seen);
  });
  return { repeated, caught };
}

/** The reply just spoken repeated one of his sentences: logged for dev calls, with no words. */
export function logRepeat(said: AlreadySaid | undefined, sessionId: string): void {
  if (said?.caught) log.info({ sessionId }, 'ALREADY_SAID_REPEAT');
}

const clip = (s: string): string =>
  s.length > ALREADY_SAID.maxQuoteChars ? `${s.slice(0, ALREADY_SAID.maxQuoteChars - 3)}...` : s;

/**
 * The ledger as a sentence of the told-this-call note, or ''. `quoted` is what
 * that note already quotes, so no sentence is named twice.
 */
export function formatAlreadySaid(said: AlreadySaid, quoted: readonly string[] = []): string {
  const skip = new Set(quoted.map(keyOf));
  const phrases = said.repeated
    .filter((s) => !skip.has(keyOf(s)))
    .slice(0, ALREADY_SAID.maxPhrases);
  if (!phrases.length) return '';
  const list = phrases.map((s) => `"${clip(s)}"`).join('; ');
  return `You've already said: ${list}. Say ${phrases.length === 1 ? 'it' : 'them'} fresh or not at all.`;
}
