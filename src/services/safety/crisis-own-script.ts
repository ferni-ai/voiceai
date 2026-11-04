/**
 * Ferni's own crisis script is never evidence of the caller's risk
 * (CRISIS_OWN_SCRIPT_NOT_EVIDENCE, off by default).
 *
 * The classifier reads Ferni's line before the caller's turn as COMPANION, to
 * work out what a short reply is about. After one false crisis read, that line
 * is Ferni's 988 script, so every next turn ("Hello.", a request for a teammate,
 * a cut-off fragment) is read against a crisis script and reads as crisis
 * again: the alarm feeds itself.
 *
 * With the flag on, a COMPANION line that is Ferni's crisis script is replaced,
 * for the classifier's reads only, by a short marker. When it asked the caller
 * a direct safety question, the question stays, word for word, and only the
 * rest goes, so a "yeah", "sometimes" or "I don't know" in answer still reads
 * as risk. The read is replaced, never
 * taken beside the plain one: a max() of both can only add alarms (#3287).
 * The caller's lines (LATEST and EARLIER) are never touched, and every other
 * check (the deterministic safety-talk checks, the screen, the adjudicator)
 * still sees Ferni's real line. With the flag off the input is the same
 * object, unchanged.
 *
 * @module CrisisOwnScript
 */

import { flagOn } from '../../config/env-flag.js';
import { stripSSML } from '../../utils/text-utils.js';
import type { CrisisClassifierInput } from './crisis-classifier.js';
import { SAFETY_TALK } from './crisis-lone-imminent.js';

type Env = Record<string, string | undefined>;

/** In place of a crisis script with no safety question in it. */
export const OWN_SCRIPT_MARK = '[the companion gave a routine safety message]';

/**
 * What makes a whole line Ferni's crisis script, not everyday talk: a crisis
 * line, suicide or self-harm named, or a check on the caller's safety.
 * Narrower than SAFETY_TALK on purpose: SAFETY_TALK is a protective check, so
 * it may over-match ("you okay with tacos?", "an emergency fund"); replacing
 * such a line would lose what the caller's reply is about.
 */
const CRISIS_SCRIPT =
  /\b(?:988|lifeline|hotline|crisis (?:line|text line|counselors?)|suicid\w*|self[- ]?harm|(?:hurt|harm|kill)(?:ing)? yourself|end(?:ing)? your life|(?:are|r) (?:you|u) (?:feeling )?safe|(?:keep|keeping) yourself safe)\b/;

/** Words that make a question in a crisis script a question about the caller's safety. */
const SAFETY_TOPIC = /\b(?:thoughts?|thinking about|thinking of|plan|safe)\b/;

/** A question to the caller with no question mark (a dropped "?"). */
const ASKS = /(?:^|[,:;] ?)(?:are|r|have|do|did|were|could|would) (?:you|u)\b/;

/** NFKC, lower case, every apostrophe variant as ', spaces collapsed. */
const loose = (text: string): string =>
  stripSSML(text)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‛′´`ʼʹ＇]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

/** A sentence that asks the caller about their safety. */
const asksSafety = (sentence: string): boolean => {
  const s = loose(sentence);
  return (s.endsWith('?') || ASKS.test(s)) && (SAFETY_TALK.test(s) || SAFETY_TOPIC.test(s));
};

/**
 * The COMPANION line the classifier reads: Ferni's line as it is or, when it is
 * his crisis script, the safety questions it asked, word for word, else the
 * marker. A question is kept as it was asked: the caller's "yeah" or "no"
 * answers it, and only its words say which answer is risk ("are you safe?"
 * against "are you having thoughts of hurting yourself?"). In the paired eval
 * a marker in front of it ("[the companion gave a safety message and asked]")
 * lost "I don't know" and "not really" answers, so there is none.
 */
export function companionForRead(companion: string | undefined): string | undefined {
  if (typeof companion !== 'string' || !CRISIS_SCRIPT.test(loose(companion))) return companion;
  const sentences = stripSSML(companion)
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?…])\s+/);
  const asked = sentences.filter(asksSafety);
  return asked.length ? asked.join(' ') : OWN_SCRIPT_MARK;
}

/** The classifier's input for one read. Flag off: the same object, unchanged. */
export function inputForRead(
  input: CrisisClassifierInput,
  env: Env = process.env
): CrisisClassifierInput {
  if (!flagOn('CRISIS_OWN_SCRIPT_NOT_EVIDENCE', env)) return input;
  const companion = companionForRead(input.companion);
  return companion === input.companion ? input : { ...input, companion };
}
