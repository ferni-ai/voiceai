/**
 * Ferni's own crisis script is never evidence of the caller's risk
 * (CRISIS_OWN_SCRIPT_NOT_EVIDENCE, off by default).
 *
 * The classifier reads Ferni's line before the caller's turn as COMPANION, to
 * work out what a short reply is about. After one false crisis read, that line
 * is Ferni's 988 script, so the next "Hello." or "I want to talk to Maya." is
 * read against a crisis script and reads as crisis again: the alarm feeds itself.
 *
 * With the flag on, the script is replaced by a short marker for the
 * classifier's reads ONLY when the caller's turn is, as a whole, a greeting, a
 * request for a teammate by name, or a request to repeat: turns that answer
 * nothing in the script. Every other turn (yes, no, nope, "no, nobody", a hedge,
 * a fragment, anything longer) reads the script exactly as main does, so an
 * answer to its question ("Are you safe right now?", "Is anyone nearby who can
 * be with you?") is never read without it. It fails closed: an unlisted turn
 * changes nothing. The read is replaced, never taken beside the plain one (a
 * max() of both can only add alarms, #3287). The caller's lines are never
 * touched, and every other check (the deterministic safety-talk checks, the
 * screen, the adjudicator) still sees Ferni's real line.
 *
 * @module CrisisOwnScript
 */

import { flagOn } from '../../config/env-flag.js';
import { stripSSML } from '../../utils/text-utils.js';
import { TEAM_FIRST_NAMES } from '../../utils/teammate-talk.js';
import type { CrisisClassifierInput } from './crisis-classifier.js';

type Env = Record<string, string | undefined>;

/** In place of Ferni's crisis script, before a turn that answers nothing in it. */
export const OWN_SCRIPT_MARK = '[the companion gave a routine safety message]';

/**
 * What makes a whole line Ferni's crisis script, not everyday talk: a crisis
 * line, suicide or self-harm named, or a check on the caller's safety.
 * Narrower than SAFETY_TALK on purpose: SAFETY_TALK is a protective check, so
 * it may over-match ("you okay with tacos?", "an emergency fund").
 */
const CRISIS_SCRIPT =
  /\b(?:988|lifeline|hotline|crisis (?:line|text line|counselors?)|suicid\w*|self[- ]?harm|(?:hurt|harm|kill)(?:ing)? yourself|end(?:ing)? your life|(?:are|r) (?:you|u) (?:feeling )?safe|(?:keep|keeping) yourself safe)\b/;

const NAME = `(?:${TEAM_FIRST_NAMES.join('|')})`;
const GREETING =
  '(?:hello|hi|hey|hiya|(?:hi|hey|hello) there|(?:are )?you there|(?:is )?any(?:one|body) there|can you hear me|do you hear me)';
const ASK_FOR =
  "(?:i (?:want|wanna|need) to (?:talk|speak) (?:to|with)|i'd like to (?:talk|speak) (?:to|with)|(?:can|could|may) i (?:talk|speak) (?:to|with)|let me (?:talk|speak) (?:to|with)|switch (?:me )?(?:over )?to|put me through to|put on|get me|bring in)";
const CLARIFY =
  "(?:what did you say|what was that|sorry what|pardon(?: me)?|come again|(?:can you |could you )?say that again|(?:can you |could you )?repeat that|i didn't (?:catch|hear) (?:that|you))";

/**
 * A caller turn that answers nothing in the script, as a whole. A request for a
 * teammate may open with a bare "no" ("No, I want to talk to Maya."): the turn
 * is the request. A bare name may not ("No, Maya." can answer "are you safe?"
 * to the persona), and a repeat request is only one with no other reading
 * (not "sorry", "huh" or "what"). Nothing else is listed; the list only ever
 * narrows the change.
 */
const NON_ANSWER = new RegExp(
  `^(?:(?:${GREETING})(?: ${GREETING}){0,2}(?: ${NAME})?` +
    `|(?:(?:no|nah)(?: no)? )?(?:(?:${ASK_FOR}) ${NAME}|(?:put|bring) ${NAME} on)(?: please)?` +
    `|${NAME}(?: please)?` +
    `|(?:${CLARIFY}))$`
);

/** NFKC, lower case, every apostrophe variant as ', other punctuation as space. */
const words = (text: string): string =>
  stripSSML(text)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‛′´`ʼʹ＇]/g, "'")
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * The classifier's input for one read. Flag off, a companion line that is not
 * Ferni's crisis script, or a caller turn off the non-answer list: the same
 * object, unchanged. Otherwise only COMPANION changes, to the marker.
 */
export function inputForRead(
  input: CrisisClassifierInput,
  env: Env = process.env
): CrisisClassifierInput {
  if (!flagOn('CRISIS_OWN_SCRIPT_NOT_EVIDENCE', env)) return input;
  const { companion, latest } = input;
  if (typeof companion !== 'string' || !CRISIS_SCRIPT.test(words(companion))) return input;
  if (!NON_ANSWER.test(words(latest))) return input;
  return { ...input, companion: OWN_SCRIPT_MARK };
}
