/**
 * Crisis agreement gate (CRISIS_AGREEMENT_GATE=on, off by default).
 *
 * One caller turn reaches the classifier from two places: the reply's crisis
 * gate and the background turn pipeline. When their inputs differ, each makes
 * its own call. Prod call 2026-10-11: the caller answered Ferni's "You still
 * there?" with a plain "still here"; the gate's read (which saw that question)
 * was none, the pipeline's (which saw no context) was crisis, and the
 * pipeline's crisis guidance reached the next reply, which recited the 988
 * line to someone who had only said he was there.
 *
 * With the gate on, when no pattern matched and the reads of the same turn
 * disagree, the turn gets a soft, context-aware check instead of crisis
 * guidance; a bare reply to a presence check counts as presence. A pattern
 * match, an imminent read, and agreeing reads are never touched.
 *
 * Dev call, same day: Ferni said downbeat things about itself ("sometimes the
 * easiest thing is the only thing that makes sense"), the line went quiet for
 * five minutes, and the caller said "You Fern." One read, with Ferni's line as
 * context, was crisis; the reply offered 988. So, also with the gate on: the
 * classifier is told Ferni's lines are Ferni's (crisis-classifier.ts), a bare
 * call of Ferni's name counts as presence, and a lone crisis read of a short
 * reply that adds nothing to Ferni's words ("What's too much effort?") gets
 * the soft check. Risk content
 * in the caller's words, now or earlier, or in Ferni's line keeps every
 * escalation as before.
 *
 * @module CrisisAgreement
 */

import { wholeWordSite } from '../../utils/safety-whole-word.js';
import { crisisBrakeOn } from './crisis-brake.js';
import type { CrisisVerdict, PatternOutcome } from './crisis-classifier.js';
import { detectCrisis } from './crisis-guard.js';

export function resolveCrisisAgreementGate(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.CRISIS_AGREEMENT_GATE?.trim().toLowerCase() === 'on';
}

/** escalate: crisis handling as before; soft: a gentle check-in; presence: nothing. */
export type AgreementOutcome = 'escalate' | 'soft' | 'presence';

/** NFKC, lower case, every apostrophe variant as ', spaces collapsed; punctuation and digits kept. */
const normalized = (text: string): string =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‛′´`ʼʹ＇]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

/** Letters, apostrophes and spaces only: for matching words and phrases. */
const words = (text: string): string =>
  normalized(text)
    .replace(/[^a-z' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Letters, apostrophes, spaces and pause marks only. A bare presence reply,
 * call or question back must pass this: digits, emoticons (":(") and emoji
 * are content of their own.
 */
const BARE_CHARS = /^[a-z' .,!?…-]+$/;
const bare = (text: string): boolean => BARE_CHARS.test(normalized(text).replace(/\.{2,}/g, '…'));

/** Ferni asking whether the caller is still on the line. */
const PRESENCE_CHECK =
  /\b(?:(?:you|u) still (?:there|with me|on)|are you there|you there|(?:did i|i) lose you|lost you|can you hear me|still on the line)\b/;

/**
 * The whole message says only that the caller is here: "still here", "yeah,
 * I'm still here", "and I'm here". Anything more ("I'm still here, barely")
 * is not a bare presence reply.
 */
const PRESENCE_REPLY =
  /^(?:(?:and|yeah|yep|yes|yup|yea|uh|um|oh|ok|okay|sorry|mhm|hey) )*(?:(?:i'm|im|i am) )?(?:still )?here(?: still)?(?: (?:yeah|yep|sorry))?$/;

/** A bare "I'm still here" answering Ferni's "you still there?". */
export function isPresenceReply(latest: string, companion?: string): boolean {
  if (typeof latest !== 'string' || typeof companion !== 'string') return false;
  if (!PRESENCE_CHECK.test(words(companion))) return false;
  return bare(latest) && PRESENCE_REPLY.test(words(latest));
}

const NAME = '(?:fern|ferni|fernie|ferny|fernee|ferne)';
const THERE = '(?:(?:are )?(?:you|u) (?:still )?(?:there|with me|around)|still (?:there|with me))';
// No assent ("yeah", "ok", "mm"): "yeah, Ferni" may be agreeing with Ferni's line.
const FILLER = '(?:hey|hi|hello|yo|oh|um|uh|so|and|you|u)';
const CALL = `(?:${NAME}|${THERE}|hello|hey)`;
/** The whole message only calls Ferni: "You Fern.", "Ferni?", "hey Fern, you there?". */
const VOCATIVE = new RegExp(`^(?:${FILLER} )*${CALL}(?: ${CALL})*$`);

export function isVocative(latest: string): boolean {
  if (typeof latest !== 'string') return false;
  return bare(latest) && VOCATIVE.test(words(latest));
}

/** The means words: risk content below, and read alone by crisis-script-answer.ts. */
const MEANS_WORDS =
  'pills?|overdos\\w*|bleach|poison\\w*|insulin|antifreeze|swallow\\w*|drank|tylenol|meds|medication|dose|bottle|sleeping|gun|pistol|rifle|bullet|loaded|rope|noose|hang\\w*|knot';
/**
 * Anything about dying, self-harm, means, goodbyes, hopelessness or distress,
 * in English or a few other languages. Broad on purpose: a match only keeps
 * the escalation there was before. Text outside plain ASCII (accents, other
 * scripts) counts as risk content, since these words cannot read it.
 */
const RISK_WORDS = [
  'di(?:e|es|ed|ing)|dead|death|deadly|lethal|fatal|kill\\w*|suicid\\w*|murder\\w*|kms|ctb|unaliv\\w*|sewer ?slide',
  'end(?:s|ed|ing)? (?:it|things|my|me|this|everything)|over (?:for good|with)|be over',
  '(?:hurt|harm|cut|burn|hit|starv)\\w* (?:my|me|your)|self ?harm|cutting|razor|blade|knife|bleed\\w*|blood|scars?',
  MEANS_WORDS,
  'bridge|ledge|edge|roof|jump\\w*|fall\\w*|tracks|train|drown\\w*|river|garage|engine|exhaust|carbon',
  'wak(?:e|ing) up|(?:be|being|stay|staying) (?:here|around|alive)|alive|living|live|exist\\w*|disappear\\w*|vanish\\w*|gone|forever|sleep',
  'good ?bye|bye|farewell|last|final|note|letters?|passwords?|my will|give (?:away|up)|giving (?:away|up)|gave (?:away|up)|after i',
  "better off|burden|point|pointless|hope\\w*|worthless|useless|trapped|no way|escape|can't (?:go|do|take|keep|cope)|cant",
  'tired of|done with (?:it|everything|life|this)|want (?:out|it to stop|to stop)|miss me|without me|nobody|no one|alone|lonely',
  'hate (?:myself|my life)|depress\\w*|numb|empty|hopeless|scared|afraid|panic\\w*|crying|cry|hurts?|pain|suffer\\w*|struggl\\w*|not (?:ok|okay|fine|good)|feel off',
  'tonight|plan\\w*|decided|ready|soon|done|enough|over it|give in',
  'morir|muer\\w*|matar\\w*|vivir|pastillas|morrer|viver|mourir|tuer|vivre|sterben|umbringen|leben|morire|uccid\\w*|vivere|ammazz\\w*',
];
const riskPattern = (list: readonly string[]): RegExp =>
  new RegExp(`\\b(?:${list.join('|')})(?:s|es|ed|ing)?\\b`);
const RISK_CONTENT = riskPattern(RISK_WORDS);
/**
 * SAFETY_WHOLE_WORD_SITES=on adds "dying" and "dyin" ('di(e|es|ed|ing)' never
 * spelled them) and changes nothing else, so on only adds risk. 'plan\w*' stays
 * as it is: narrowing it to skip "plane" and "plants" lost real risk ("I'm going
 * to crash this plane", "boarding a plane, never coming back").
 */
const RISK_CONTENT_SITES = riskPattern([...RISK_WORDS, 'dying|dyin']);
const MEANS = riskPattern([MEANS_WORDS]);

/** A means word ("pills", "rope", "the bottle"), whole words only. */
export const mentionsMeans = (text: string): boolean => MEANS.test(words(text));

/**
 * The caller agreeing with, or echoing, what Ferni said ("yeah, same", "me
 * too", "that's how I feel"): that takes Ferni's line as the caller's own, so
 * it counts as risk content in the caller's words (never in Ferni's line).
 */
const ENDORSEMENT =
  /\b(?:same|me too|me neither|exactly|totally|agree\w*|true|relat(?:e|able)|i feel (?:that|you|it)|feel the same|how i(?:'ve been| am|'m)? feel\w*|you get it|get that|know the feeling|keep thinking|been thinking|story of my life|mood|honestly|right|literally me|that's me|so do i|neither do i)\b/;

export function endorses(latest: string | undefined | null): boolean {
  if (typeof latest !== 'string') return true;
  try {
    return ENDORSEMENT.test(words(latest)) || ENDORSEMENT.test(normalized(latest));
  } catch {
    return true;
  }
}

/** Sad or hurt emoticons: ":(", ":'(", ";_;", "</3". */
const EMOTICON = /[:;=8][-'^o]?[([/\\|{<@]|[)\]/\\|}>][-'^o]?[:;=8]|<\/3|;_;|\bt_t\b/i;

/**
 * True for anything it cannot read: a failed check never softens a turn.
 * Checked on the raw (NFKC) text too, so punctuation or digits between words
 * never hide a phrase.
 */
export function hasRiskContent(text: string | undefined | null): boolean {
  if (typeof text !== 'string') return true;
  try {
    const has = (risk: RegExp): boolean =>
      /[^\t\n\r\x20-\x7E’‘“”—–…]/.test(text) ||
      EMOTICON.test(text) ||
      risk.test(words(text)) ||
      risk.test(normalized(text));
    return wholeWordSite(
      'crisis-agreement',
      () => has(RISK_CONTENT),
      () => has(RISK_CONTENT_SITES)
    );
  } catch {
    return true;
  }
}

/** CRISIS_BRAKE_V2: everyday words that are risk only in a risk phrase ("done with life" stays one). */
const EVERYDAY_ALONE =
  /\b(?:good ?bye|bye|point|live|sleep|alone|tonight)(?:s|ed)?\b|\bdone\b(?! with (?:it|everything|life|this)\b)/g;

/**
 * The caller's words hold risk (CRISIS_BRAKE_V2): a guard pattern (the risk phrases: "sleep
 * forever"), or the list above without the everyday words alone. True for what it can't read.
 */
export function hasCallerRiskContent(text: string | undefined | null): boolean {
  if (typeof text !== 'string') return true;
  try {
    const found = detectCrisis(text);
    if (found.severity > 0 || found.indicators.length > 0) return true;
    return hasRiskContent(normalized(text).replace(EVERYDAY_ALONE, ' '));
  } catch {
    return true;
  }
}

/** Words with no meaning of their own in a question back to Ferni. No assent, no "done" or "too much". */
const FUNCTION_WORDS = new Set(
  (
    "you you're your u it it's its that that's this the a an and or but so " +
    "is are was were be been do does did don't doesn't didn't isn't aren't " +
    "what what's why why's how how's who where when which to of in on at for with about " +
    'oh ah uh um huh hey hi hello fern ferni fernie ferny fernee ferne'
  ).split(' ')
);
const QUESTION_WORD = /^(?:what|what's|why|why's|how|how's|who|where|when|which)$/;
/**
 * The caller speaking about themselves: never a bare question back, even when
 * Ferni used the same word about itself ("I'm tired" in Ferni's line).
 */
const FIRST_PERSON = /^(?:i|i'm|im|i've|ive|i'd|id|i'll|me|my|myself|mine|am|we|we're|us|our)$/;
const stem = (w: string): string => w.replace(/'s$/, '').replace(/s$/, '');

/**
 * A short question back about what Ferni just said ("What's too much effort?",
 * "Why is that?"): it starts with a question word, and every word is a
 * question or function word or one of Ferni's, so the words a read found
 * risky were Ferni's. Statements, assent and echoes ("yeah", "same", "the
 * only thing that makes sense?") never qualify, nor does text with digits,
 * emoticons or emoji. Without Ferni's line, nothing qualifies.
 */
export function addsNothing(latest: string, companion?: string): boolean {
  if (typeof latest !== 'string' || typeof companion !== 'string' || !companion.trim()) {
    return false;
  }
  const said = new Set(words(companion).split(' ').map(stem));
  const own = words(latest).split(' ').filter(Boolean);
  // Starts with a question word: a statement or echo with a "?" on the end does not count.
  const asks = QUESTION_WORD.test(own[0] ?? '');
  return (
    asks &&
    bare(latest) &&
    own.length > 0 &&
    own.length <= 12 &&
    !own.some((w) => FIRST_PERSON.test(w)) &&
    own.every((w) => FUNCTION_WORDS.has(w) || said.has(stem(w)))
  );
}

/**
 * How a turn's classifier reads combine with the pattern outcome. Only a turn
 * the patterns passed, with no imminent read, can be softened.
 */
export function agreementOutcome(args: {
  pattern: PatternOutcome;
  verdicts: ReadonlyArray<CrisisVerdict | null>;
  latest: string;
  earlier?: readonly string[];
  companion?: string;
  /** CRISIS_BRAKE_V2 reads both (crisis-brake.ts). */
  env?: Record<string, string | undefined>;
  call?: string;
}): AgreementOutcome {
  try {
    return outcomeOf(args);
  } catch {
    return 'escalate'; // fail closed: an error never softens a turn
  }
}

function outcomeOf(args: Parameters<typeof agreementOutcome>[0]): AgreementOutcome {
  const { pattern, latest, companion, earlier = [] } = args;
  if (pattern !== 'none') return 'escalate';
  const verdicts = Array.isArray(args.verdicts) ? args.verdicts : [];
  // A read that timed out, failed or did not parse might have been the one that saw risk.
  if (verdicts.length === 0 || verdicts.some((v) => !v || typeof v.risk !== 'string')) {
    return 'escalate';
  }
  const reads = verdicts as readonly CrisisVerdict[];
  if (reads.some((v) => v.risk === 'imminent')) return 'escalate';
  if (!reads.some((v) => v.risk === 'crisis')) return 'escalate';
  // Softening needs Ferni's line to judge against, and the caller's own words.
  if (typeof latest !== 'string' || !latest.trim()) return 'escalate';
  if (typeof companion !== 'string' || !companion.trim()) return 'escalate';
  // Ferni's line is checked too: it may have asked about the caller's safety. CRISIS_BRAKE_V2:
  // the caller's words only, since Ferni's own crisis reply made the gate unable to ease.
  const brake = crisisBrakeOn(args.env, args.call, [latest, ...earlier]);
  const scanned = brake ? [latest, ...earlier] : [latest, ...earlier, companion];
  const quiet = !endorses(latest) && !scanned.some(brake ? hasCallerRiskContent : hasRiskContent);
  if (quiet && (isPresenceReply(latest, companion) || isVocative(latest))) return 'presence';
  // Soft only for a short question back about Ferni's own words, with no risk
  // or agreement anywhere: whether the reads disagree or one read stands alone.
  // Disagreement alone never softens (a word list cannot vouch for a long
  // statement, or one in another language).
  // Two reads that found crisis, under any key for this turn, are never softened; with
  // CRISIS_BRAKE_V2 two reads of the same words are one read, not agreement.
  if (!brake && reads.filter((v) => v.risk === 'crisis').length >= 2) return 'escalate';
  const contested = brake || reads.length === 1 || reads.some((v) => v.risk === 'none');
  return quiet && contested && addsNothing(latest, companion) ? 'soft' : 'escalate';
}

/** The guidance for a soft check: stay in the conversation, check in only if it fits. */
export const SOFT_CRISIS_CHECK = `[SAFETY - SOFT CHECK]
A safety read of the caller's last words was unsure whether something heavier is going on. What you said about your own day or mood is yours, not theirs.
Read their words in the context of the conversation:
1. Stay in the conversation you were having; do not switch to crisis talk or mention hotlines on this alone
2. If their words or tone suggest they might be struggling, check in once, plainly and warmly ("you doing okay?"), and follow their lead
3. If they say anything about hurting themselves or not wanting to be here, take it seriously and offer the 988 Suicide & Crisis Lifeline`;
