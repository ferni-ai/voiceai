/**
 * What Ferni has already said word for word on a call: how his recent replies
 * opened, and any sentence he has said in two of them, so the next reply
 * doesn't say it again (ALREADY_SAID_LEDGER=on, off by default).
 *
 * The told-this-call record (told-this-call.ts) quotes a sentence only when it
 * shares a six-word run with another reply or runs eight words or more, and
 * PHRASE_LOOP_GUARD (phrase-loops.ts) names a stock phrase only once two
 * replies have said it. A short line said again and again ("That's a big
 * step.", in three replies running) is never quoted, and nothing tells him how
 * his last replies opened before he opens the next one the same way.
 *
 * The ledger reads Ferni's own lines only, never the caller's: the opening
 * sentence of each of his last `replyWindow` replies, and every sentence that
 * two of those replies said alike once case and punctuation are normalised.
 * Older replies have expired. The told-this-call note carries both as one
 * line, repeated sentences first. Nothing he says is rewritten (a streamed
 * reply can't be, without cutting words): `caught` only marks, for the log,
 * that his newest reply repeated a sentence.
 *
 * Crisis, safety and notice wording stays word for word, three ways: a reply
 * that mentions a crisis resource is not in the ledger; a sentence on safety,
 * harm or help (isSafetyLine) or a notice (an AI disclosure, what is kept from
 * the call, an advice disclaimer) is never listed; and once a call has crisis
 * risk noted, the note carries no ledger at all (told-this-call.ts keptTold).
 *
 * @module agents/personas/already-said
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { mentionsCrisisResource } from './listen-offer.js';
import { isSafetyLine, normalized } from './phrase-loops.js';

const log = createLogger({ module: 'AlreadySaid' });

/** Every setting of the ledger, in one place. */
export const ALREADY_SAID = {
  flag: 'ALREADY_SAID_LEDGER',
  /** Ferni's latest replies the ledger reads; anything before them has expired. */
  replyWindow: 6,
  /** A sentence of fewer words ("Yeah.", "Mm, totally.") is never listed. */
  minWords: 3,
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
  /** The opening sentence of each reply in the window, newest first, minus any in `repeated`. */
  openers: string[];
  /** The newest reply said a sentence an earlier reply in the window had said. */
  caught: boolean;
}

/** Notices said as written: an AI disclosure, what is kept from the call, an advice disclaimer. */
const NOTICE =
  /\b(?:an ai|not a (?:real )?(?:person|human)|recorded|recording|(?:is|are|gets?|be) kept|nothing (?:from|of) this call|(?:medical|legal|financial) advice|not a (?:doctor|lawyer|therapist|counsel(?:or|lor))|consent\w*)\b/i;

/** A sentence that must stay word for word, so is never listed: safety, harm, help or a notice. */
const staysVerbatim = (sentence: string): boolean =>
  isSafetyLine(sentence) || NOTICE.test(sentence);

/** A sentence as compared: markup gone, then lowercase words only. */
const keyOf = (sentence: string): string => normalized(sentence.replace(/<[^>]+>/g, ' '));

const listable = (sentence: string): boolean =>
  keyOf(sentence).split(' ').filter(Boolean).length >= ALREADY_SAID.minWords &&
  !staysVerbatim(sentence);

/** The ledger from Ferni's replies so far, each as its sentences, oldest first. */
export function alreadySaid(replies: ReadonlyArray<readonly string[]>): AlreadySaid {
  const window = replies
    .filter((reply) => !mentionsCrisisResource(reply.join(' ')))
    .slice(-ALREADY_SAID.replyWindow);
  const said = new Map<string, { first: string; replies: number }>();
  for (const reply of window) {
    const keys = new Set<string>();
    for (const sentence of reply.filter(listable)) {
      const key = keyOf(sentence);
      if (keys.has(key)) continue;
      keys.add(key);
      const seen = said.get(key);
      if (seen) seen.replies += 1;
      else said.set(key, { first: sentence, replies: 1 });
    }
  }
  const again = (sentence: string): boolean => (said.get(keyOf(sentence))?.replies ?? 0) > 1;
  const repeated = [...said.values()]
    .filter((s) => s.replies > 1)
    .sort((a, b) => b.replies - a.replies)
    .map((s) => s.first);
  const openers = [...window]
    .reverse()
    .map((reply) => reply[0])
    .filter((s): s is string => Boolean(s) && listable(s) && !again(s))
    .filter((s, i, all) => all.findIndex((o) => keyOf(o) === keyOf(s)) === i);
  return { repeated, openers, caught: (window.at(-1) ?? []).some(again) };
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
  const phrases = [...said.repeated, ...said.openers]
    .filter((s) => !skip.has(keyOf(s)))
    .slice(0, ALREADY_SAID.maxPhrases);
  if (!phrases.length) return '';
  const list = phrases.map((s) => `"${clip(s)}"`).join('; ');
  return `You've already said: ${list}. Open differently, and don't say ${phrases.length === 1 ? 'it' : 'them'} again.`;
}
