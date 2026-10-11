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

import type { CrisisVerdict, PatternOutcome } from './crisis-classifier.js';

export function resolveCrisisAgreementGate(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.CRISIS_AGREEMENT_GATE?.trim().toLowerCase() === 'on';
}

/** escalate: crisis handling as before; soft: a gentle check-in; presence: nothing. */
export type AgreementOutcome = 'escalate' | 'soft' | 'presence';

const words = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[^a-z' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

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
  if (!companion || !PRESENCE_CHECK.test(words(companion))) return false;
  return PRESENCE_REPLY.test(words(latest));
}

const NAME = '(?:fern|ferni|fernie|ferny|fernee|ferne)';
const THERE = '(?:(?:are )?(?:you|u) (?:still )?(?:there|with me|around)|still (?:there|with me))';
const FILLER = '(?:hey|hi|hello|yo|oh|um|uh|hmm|mm|so|ok|okay|yeah|and|you|u)';
const CALL = `(?:${NAME}|${THERE}|hello|hey)`;
/** The whole message only calls Ferni: "You Fern.", "Ferni?", "hey Fern, you there?". */
const VOCATIVE = new RegExp(`^(?:${FILLER} )*${CALL}(?: ${CALL})*$`);

export function isVocative(latest: string): boolean {
  return VOCATIVE.test(words(latest));
}

/**
 * Anything about dying, self-harm, means, goodbyes, hopelessness or distress,
 * in English or a few other languages. Broad on purpose: a match only keeps
 * the escalation there was before. Text outside plain ASCII (accents, other
 * scripts) counts as risk content, since these words cannot read it.
 */
const RISK_CONTENT = new RegExp(
  `\\b(?:${[
    'di(?:e|es|ed|ing)|dead|death|deadly|lethal|fatal|kill\\w*|suicid\\w*|murder\\w*|kms|ctb|unaliv\\w*|sewer ?slide',
    'end(?:s|ed|ing)? (?:it|things|my|me|this|everything)|over (?:for good|with)|be over',
    '(?:hurt|harm|cut|burn|hit|starv)\\w* (?:my|me|your)|self ?harm|cutting|razor|blade|knife|bleed\\w*|blood|scars?',
    'pills?|overdos\\w*|bleach|poison\\w*|insulin|antifreeze|swallow\\w*|drank|tylenol|meds|medication|dose|bottle|sleeping|gun|pistol|rifle|bullet|loaded|rope|noose|hang\\w*|knot',
    'bridge|ledge|edge|roof|jump\\w*|fall\\w*|tracks|train|drown\\w*|river|garage|engine|exhaust|carbon',
    'wak(?:e|ing) up|(?:be|being|stay|staying) (?:here|around|alive)|alive|living|live|exist\\w*|disappear\\w*|vanish\\w*|gone|forever|sleep',
    'good ?bye|bye|farewell|last|final|note|letters?|passwords?|my will|give (?:away|up)|giving (?:away|up)|gave (?:away|up)|after i',
    "better off|burden|point|pointless|hope\\w*|worthless|useless|trapped|no way|escape|can't (?:go|do|take|keep|cope)|cant",
    'tired of|done with (?:it|everything|life|this)|want (?:out|it to stop|to stop)|miss me|without me|nobody|no one|alone|lonely',
    'hate (?:myself|my life)|depress\\w*|numb|empty|hopeless|scared|afraid|panic\\w*|crying|cry|hurts?|pain|suffer\\w*|struggl\\w*|not (?:ok|okay|fine|good)|feel off',
    'tonight|plan\\w*|decided|ready|soon',
    'morir|muer\\w*|matar\\w*|vivir|pastillas|morrer|viver|mourir|tuer|vivre|sterben|umbringen|leben|morire|uccid\\w*|vivere|ammazz\\w*',
  ].join('|')})(?:s|es|ed|ing)?\\b`
);

export function hasRiskContent(text: string): boolean {
  return /[^\t\n\r\x20-\x7E’‘“”—–…]/.test(text) || RISK_CONTENT.test(words(text));
}

/** Words that carry no meaning of their own in a reply. */
const FUNCTION_WORDS = new Set(
  (
    "i i'm im me my mine you you're your yours u it it's its that that's this these those " +
    'the a an and or but so is are was were be been am do does did done have has had ' +
    "don't doesn't didn't isn't aren't not no yes yeah yep yup yea ok okay oh ah aw uh um " +
    "mm mhm hmm huh ha haha hah lol what what's why why's how how's who where when which " +
    'really just like to of in on at for with about too much more very well right sure true ' +
    'totally same cool nice wow hey hi hello there here still then now mean say said know ' +
    'think thought kind sort get got go thing things fern ferni fernie ferny fernee ferne'
  ).split(' ')
);
const stem = (w: string): string => w.replace(/'s$/, '').replace(/s$/, '');

/**
 * Every word of the caller's message is a function word or one Ferni just
 * said ("What's too much effort?", "Why is that?", "Yeah."): the caller added
 * nothing of their own, so the words a read found risky were Ferni's. Short
 * messages only: longer speech gets the full read.
 */
export function addsNothing(latest: string, companion?: string): boolean {
  const said = new Set(
    words(companion ?? '')
      .split(' ')
      .map(stem)
  );
  const own = words(latest).split(' ').filter(Boolean);
  return (
    own.length > 0 &&
    own.length <= 12 &&
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
}): AgreementOutcome {
  const { pattern, latest, companion, earlier = [] } = args;
  if (pattern !== 'none') return 'escalate';
  const reads = args.verdicts.filter((v): v is CrisisVerdict => v !== null);
  if (reads.some((v) => v.risk === 'imminent')) return 'escalate';
  if (!reads.some((v) => v.risk === 'crisis')) return 'escalate';
  // Ferni's line is checked too: it may have asked about the caller's safety.
  const quiet = ![latest, ...earlier, companion ?? ''].some(hasRiskContent);
  if (quiet && (isPresenceReply(latest, companion) || isVocative(latest))) return 'presence';
  if (reads.some((v) => v.risk === 'none')) return 'soft';
  // A lone read: soft only when the caller added nothing of their own.
  return quiet && args.verdicts.length === 1 && addsNothing(latest, companion)
    ? 'soft'
    : 'escalate';
}

/** The guidance for a soft check: stay in the conversation, check in only if it fits. */
export const SOFT_CRISIS_CHECK = `[SAFETY - SOFT CHECK]
A safety read of the caller's last words was unsure whether something heavier is going on, but nothing they said was about crisis. What you said about your own day or mood is yours, not theirs.
Read their words in the context of the conversation:
1. Stay in the conversation you were having; do not switch to crisis talk or mention hotlines on this alone
2. If their words or tone suggest they might be struggling, check in once, plainly and warmly ("you doing okay?"), and follow their lead
3. If they say anything about hurting themselves or not wanting to be here, take it seriously and offer the 988 Suicide & Crisis Lifeline`;
