/**
 * A request to forget something is everyday memory business (CRISIS_FORGET_EVERYDAY=on, off by
 * default; #4159).
 *
 * Dev 2026-11-19, three calls: callers asked Ferni to forget a topic ("please forget everything
 * about the Denver job, I've decided and I don't want it brought up", "and forget Theo's number
 * too, I'll just keep it in my phone"). No pattern matched, the live classifier alone read
 * crisis, and Ferni answered the forget with the 988 line, on one call on four more turns.
 *
 * The same rule as a teammate request (crisis-transfer-request.ts), with the same guards: with
 * the flag on, a classifier-only crisis read (never an imminent read, and never the script) of
 * such a turn gets the soft check-in (SOFT_CRISIS_CHECK) instead of crisis guidance; never
 * nothing. The crisis gate and the turn pipeline apply it, and only when ALL of these hold:
 * - no pattern matched (pattern 'none');
 * - the caller's latest words are only a request to forget, delete or not bring up a named
 *   thing ("forget everything about the Denver job", "delete Theo's number", "don't bring up
 *   the move"), and in the same line at most "don't bring it up" about it, "I'm sure" or "I'll
 *   keep it in my phone". Never about the caller themself or their life ("forget me", "forget I
 *   exist", "forget I said that"), never "everything" alone, never an emergency or crisis line.
 *   A bare "forget it" never counts: callers also say it to take back something heavy. Nor does
 *   "I've decided": the risk list below reads it as resolve, so that line keeps its handling;
 * - every thing it names ends in an everyday noun (a job, a number, the move, a trip, the
 *   dentist: EVERYDAY_NOUN). Texts, a journal, a letter, who gets the dog, anything for after or
 *   for a person, and every typo keep crisis handling;
 * - the call is known, and no earlier read on it found risk, failed or is still running, and
 *   nothing on it escalated (crisis-call-risk.ts);
 * - nothing the caller said this call, nor the companion's line they answer, holds a word from
 *   the agreement gate's risk list (hasRiskContent), and nothing the caller said agrees with or
 *   echoes the companion (endorses);
 * - no live adjudicator is there to decide, and the agreement gate did not find the turn's crisis
 *   reads agreeing.
 * Anything else, and any error, leaves the crisis handling as it was.
 *
 * @module CrisisForgetRequest
 */

import type { Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { endorses, hasRiskContent } from './crisis-agreement.js';
import type { CrisisClassifierInput, PatternOutcome } from './crisis-classifier.js';
import { crisisRiskThisCall } from './crisis-call-risk.js';

const log = createLogger({ module: 'CrisisForgetRequest' });

/** What may start a clause: greeting, filler, a joining word. */
const LEAD = `(?:(?:hey|hi|okay|ok|um|uh|so|alright|yeah|yes|yep|actually|and|also|oh|well|but|first|before anything|one more thing|on second thought|you know what) )*`;
const ASK = `(?:(?:can|could|would|will) (?:you|u) (?:please |just )?|i (?:want|would like|'d like|d like) (?:you )?to |please |just )*`;

/** A pronoun standing for the thing already named. */
const PRONOUN = `(?:it|that|this|those|them)`;
/**
 * A named thing is a noun phrase ("the Denver job", "Theo's new number", "my old apartment"): one
 * to six words, none of them a person or pronoun, a form of "be", a negation, a joining word or
 * filler, so a sentence after it ("forget the Denver job I'm so tired") is never read as part of
 * its name. It never starts with "everything", "anything", "all" or "about".
 *
 * No word that can open a clause (a verb, "do", an ask, a single-word lead) is ever part of a
 * name, so where one name ends and the next clause starts is never ambiguous. Without that, a
 * line of 40 "forget"s ending in "i" took the regex 30 seconds to reject, on the crisis path.
 */
const NOT_IN_NAME = `(?:i|i'm|im|i've|ive|i'd|i'll|me|myself|you|you're|we|they|he|she|it|it's|its|that|that's|this|these|those|them|there|there's|am|is|are|was|were|be|been|being|not|no|never|nothing|don't|dont|do|can't|cant|won't|wont|didn't|and|but|or|so|because|cause|just|really|too|very|feel|feeling|felt|tired|again|please|now|forget|erase|delete|remove|can|could|would|will|hey|hi|okay|ok|um|uh|alright|yeah|yes|yep|actually|also|oh|well|first|before)`;
const NAME_WORD = `(?!${NOT_IN_NAME}(?: |$))[a-z0-9']+`;
const NAMED = `(?!(?:everything|anything|all|about)(?: |$))${NAME_WORD}(?: ${NAME_WORD}){0,5}`;

const VERB = `(?:forget|erase|delete|remove)`;
const SCOPE = `(?:(?:everything|anything|all) )?(?:(?:about|of|on) )?(?:(?:what|everything) i (?:said|told you) about |(?:that )?i (?:mentioned|brought up|told you about) )?`;
const MEMORY = `(?: (?:from|out of) (?:your|ur) (?:memory|notes))?`;
const AGAIN = `(?: (?:again|ever again|too|as well|please|now))*`;

/** Asking to forget or delete a named thing, or never to raise it. */
const NAMED_CLAUSE = [
  `${VERB} ${SCOPE}${NAMED}${MEMORY}`,
  `(?:don't|dont|do not|never) (?:bring up|mention|ask about|talk about) ${NAMED}`,
  `i (?:don't|dont|do not) want (?!to )${NAMED} (?:brought up|mentioned)`,
]
  .map((form) => `${form}${AGAIN}`)
  .join('|');

/** Beside a named one only: never raising "it", or a plain aside. */
const BESIDE = [
  `(?:don't|dont|do not|never) (?:bring ${PRONOUN} up|mention ${PRONOUN})${AGAIN}`,
  `i (?:don't|dont|do not) want ${PRONOUN} (?:brought up|mentioned)${AGAIN}`,
  `(?:yes |yeah )?(?:i'm|i am) sure`,
  `(?:i'll|i will) (?:just )?keep (?:it|that|them) (?:in my phone|in my contacts|written down)`,
].join('|');

const CLAUSE = `${LEAD}${ASK}(?:${NAMED_CLAUSE}|${BESIDE})`;
/** Every clause a forget request or one beside it. */
const FORGET_LINE = new RegExp(`^${CLAUSE}(?: ${CLAUSE})*$`);
/** A forget request about a named thing somewhere in the line. */
const NAMED_FORGET = new RegExp(`(?:^| )${LEAD}${ASK}(?:${NAMED_CLAUSE})(?: |$)`);

/**
 * Never a forget request, wherever it is in the line: the caller themself or their life, ending
 * or leaving, harm, help, an emergency or crisis line. Checked on its own, so no grammar change
 * can ever exempt "forget about me" or "delete everything, I won't need it".
 *
 * Nor putting affairs in order or clearing what is kept for others, both on the usual
 * warning-sign lists (owner's decision, 2026-11-26, after the #4277 verify): insurance, money and
 * accounts, possessions, and photos, videos, voicemails, messages, recordings and letters ("delete
 * my insurance policy details", "erase every photo of us", "delete the voicemail for my mom").
 * A false check-in there costs little; a missed one does not.
 */
const NEVER = new RegExp(
  `\\b(?:${[
    // the caller, ending, harm, help
    'me|myself|life|living|alive|exist\\w*|here|gone|leav\\w*|die|dying|dead|death|kill\\w*|hurt\\w*|harm\\w*|suicid\\w*|goodbye|bye|end|ending|over|done|everyone|everybody|nobody|world|need|better off|without (?:me|us)|burden\\w*|anymore|any more',
    // emergency and crisis lines
    '911|988|999|112|crisis|hotline|lifeline|help|emergency|pain|hopeless|(?:nine|9) (?:(?:one|1) (?:one|1)|(?:eight|8) (?:eight|8))',
    // affairs in order: insurance, money, accounts, possessions
    'insur\\w*|polic(?:y|ies)|beneficiar\\w*|bank\\w*|account\\w*|money|cash|savings?|funds?|financ\\w*|pension\\w*|retire\\w*|401k|invest\\w*|stocks?|crypto|wallets?|estate|inherit\\w*|deeds?|belongings|possessions|valuables',
    // what is kept for others
    'photo\\w*|pic|pics|pictures?|videos?|voicemails?|voice ?mails?|messages?|recordings?|letters?',
  ].join('|')})\\b`
);

/**
 * The named thing must end in an everyday noun (the Denver job, Theo's number, the move, the
 * Lisbon trip): the only names that soften. A block list (NEVER) fails open: three verify rounds
 * each found new risky names it lacked (texts to a sister, a journal, the playlist for a funeral,
 * who gets the dog, typos like "lettr"). An allowlist fails closed: any name not on it, and any
 * name that runs on into "to my mom", "for after" or "for my funeral", keeps crisis handling.
 */
const EVERYDAY_NOUN = new Set([
  ...['job', 'jobs', 'offer', 'interview', 'role', 'position', 'promotion', 'project', 'deadline'],
  ...['presentation', 'meeting', 'meetings', 'appointment', 'appointments', 'dentist', 'haircut'],
  ...['call', 'recruiter', 'move', 'trip', 'vacation', 'holiday', 'flight', 'hotel', 'commute'],
  ...['apartment', 'place', 'neighborhood'],
  ...['number', 'address', 'restaurant', 'recipe', 'show', 'movie', 'book', 'podcast', 'game'],
  ...['concert', 'class', 'course', 'gym', 'workout', 'diet', 'schedule', 'reminder', 'idea'],
]);
/** A named thing as the forget forms capture it, then cut back to the name alone. */
const NAMED_FORM = new RegExp(
  `(?:^| )${LEAD}${ASK}(?:${VERB} ${SCOPE}(${NAMED})|(?:don't|dont|do not|never) (?:bring up|mention|ask about|talk about) (${NAMED})|i (?:don't|dont|do not) want (?!to )(${NAMED}) (?:brought up|mentioned))`,
  'g'
);
const NAME_TAIL = / (?:(?:from|out of) (?:your|ur) (?:memory|notes)|ever)$/;

/** True when every thing the line names ends in an everyday noun, and it names at least one. */
function namesOnlyEverydayThings(said: string): boolean {
  const names = [...said.matchAll(NAMED_FORM)].map((m) =>
    (m[1] ?? m[2] ?? m[3] ?? '').replace(NAME_TAIL, '')
  );
  return names.length > 0 && names.every((name) => EVERYDAY_NOUN.has(name.split(' ').pop() ?? ''));
}

/** NFKC, lower case, every apostrophe variant as ', only letters, digits, apostrophes and spaces. */
const words = (text: string): string =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‛′´`ʼʹ＇]/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** True when the line only asks to forget a named thing (see the module comment). */
function isForgetRequestOnly(text: string): boolean {
  if (typeof text !== 'string') return false;
  const said = words(text);
  if (!said || said.split(' ').length > 24 || NEVER.test(said)) return false;
  return FORGET_LINE.test(said) && NAMED_FORGET.test(said) && namesOnlyEverydayThings(said);
}

/**
 * Only the word "on" turns it on, not "live", "true" or "1": it lowers a crisis reply, and the
 * reply never-lower test (crisis-reply.never-lower.ts LOWERS_A_REPLY) declares that for one word.
 */
function forgetEverydayOn(env: Env): boolean {
  return env.CRISIS_FORGET_EVERYDAY?.trim().toLowerCase() === 'on';
}

/** Whether this turn's classifier-only crisis read gets the soft check-in (see the module comment). */
export function forgetRequestIsEveryday(
  input: CrisisClassifierInput,
  pattern: PatternOutcome,
  call: string | undefined,
  env: Env = process.env
): boolean {
  if (!forgetEverydayOn(env) || pattern !== 'none') return false;
  try {
    // This turn's own reads (the other path's) are not risk; any other read in flight is.
    if (!call || crisisRiskThisCall(call, input.latest)) return false;
    if (!Array.isArray(input.earlier) || !isForgetRequestOnly(input.latest)) {
      return false;
    }
    const companion = typeof input.companion === 'string' ? input.companion.trim() : '';
    const caller = [input.latest, ...input.earlier];
    // Agreeing with or echoing Ferni ("yeah, same") takes his line as the caller's own.
    if (caller.some(endorses)) return false;
    if ([...caller, ...(companion ? [companion] : [])].some(hasRiskContent)) return false;
    log.info({ source: 'forget-request' }, 'CRISIS_FORGET_EVERYDAY');
    return true;
  } catch (error) {
    log.warn({ error: String(error) }, 'Forget-request check failed; crisis handling as before');
    return false;
  }
}
