/**
 * Ferni never says help is coming when nobody sent it (#1553).
 *
 * Ferni cannot reach emergency services: checkDialableNumber
 * (utils/dialable-number.ts) refuses 911, 988 and every N11 number, so no tool
 * on any call makes "I'm calling an ambulance now" or "Calling 911." true. A
 * caller in crisis who hears one waits for help that is not coming. Two shapes:
 * - 'called': Ferni says he called, is calling, will call, alerted or sent for
 *   emergency services or help. Always false; the guard (action-claim-guard.ts)
 *   always swaps it for EMERGENCY_LINE, and action-claims.ts reads it as a call.
 * - 'coming': help or a service is said to be coming, with no "I" ("Help is on
 *   the way."). Plenty of light talk says that too ("help is on the way, the
 *   weekend's nearly here", "the fire department is coming to inspect"), so it
 *   is swapped only when the caller's recent words are about an emergency
 *   (crisisInPlay, on for the rest of the call once they are), and stands when
 *   the caller said help was already called.
 *
 * The patterns read lower-case clauses, before any name is rewritten.
 *
 * @module agents/personas/emergency-claim
 */
import { IN_DANGER_NOW } from '../safety/crisis-guard.js';
import { recentSpoken, spokenOf, plain, type Item } from './spoken-words.js';

/** What Ferni says in place of an emergency claim: he didn't call, and where to turn now. */
export const EMERGENCY_LINE = `I can't reach emergency services for you, so I haven't called them. If you're in danger right now, ${IN_DANGER_NOW}`;

/**
 * An emergency in the caller's words. The action-claim guard's ask detector
 * (ASK_SHAPE) uses the same words, with "help" added there for any request.
 */
export const CRISIS_TALK =
  "ambulance|911|police|emergency|fire department|hurt\\w*|fell|fallen|(?:can'?t|cannot|can not) breathe|heart attack|chest|bleed\\w*|breaking in|broke in|overdos\\w*|suicid\\w*|not breathing|collaps\\w*|passed out|unconscious|stroke|chok\\w*|seizure|fire|accident|gun|knife|cops|kill (?:my|him|her)sel(?:f|ves)|end it all|(?:don'?t|do not) want to (?:live|be here)|ayuda|hilfe|socorro|aiuto|au secours";
const CRISIS = new RegExp(`\\b(?:${CRISIS_TALK})\\b`, 'i');

const HAVE = "\\b(?:i'?ve|i have|we'?ve|i just|i'?ve just|i already|i'?ve already)";
const DOING = "\\b(?:i'?m|i am|we'?re)(?: just| now| already)?";
const WILL = "\\b(?:let me|i'?m going to|i'?m gonna|i'?ll|i will)";
const LEAD =
  "^(?:(?:okay|ok|alright|all right|right|on it|i'?m on it|hang on|stay with me|hold on)\\W+)*";
const NOW = '(?: (?:now|right now|right away|immediately))?';
/** Emergency services by name. Not "the police report", "the emergency vet", "the emergency room". */
const SERVICE =
  '(?<![\\w-])(?:(?:an|the) )?(?:ambulance|paramedics|emts?|ems|police|cops|fire (?:department|brigade)|emergency services|emergency(?! contacts?\\b)|authorities|9[- ]?1[- ]?1|nine[- ]one[- ]one|999|112)\\b(?![- ](?:report|number|non-emergency|vet|room|station)\\b)';
/** Help itself, as something Ferni could send or get: not "help from Maya" or "help with that". */
const HELP = '(?:help\\b(?! (?:from|with|desk|center|centre|line)\\b))';
const TARGET = `(?:you )?(?:${SERVICE}|${HELP}|for help\\b)`;
/** Someone sent or called, not "someone a card" ("let me get someone for you" may be a handoff). */
const SOMEONE = 'someone\\b(?! an? )';
/** Who is said to be coming. */
const RESCUE = `(?:${SERVICE}|help\\b|someone)`;

/** Ferni says he called, is calling, will call or sent for emergency services or help. */
export const EMERGENCY_CALLED: readonly RegExp[] = [
  new RegExp(
    `${HAVE} (?:called|rung|rang|phoned|dialed|dialled|contacted|alerted|notified|sent for|reached out to|got hold of) ${TARGET}`
  ),
  new RegExp(
    `${DOING} (?:calling|ringing|dialing|dialling|phoning|contacting|alerting|notifying|reaching out to|getting|sending for) ${TARGET}`
  ),
  // A plain future is a promise Ferni can't keep, and the caller may wait on it.
  new RegExp(`${WILL} (?:call|ring|dial|phone|contact|alert|notify|reach out to|get) ${TARGET}`),
  new RegExp(`\\bi (?:called|phoned|dialed|dialled|rang) ${SERVICE} for you\\b`),
  new RegExp(
    `(?:${HAVE} (?:called|phoned|rung|rang)|${DOING} (?:calling|phoning)) someone for you\\b`
  ),
  new RegExp(`${LEAD}(?:calling|dialing|dialling|ringing|phoning) ${SERVICE}${NOW}\\W*$`),
  new RegExp(`${HAVE} (?:sent|dispatched) (?:you )?(?:help\\b|${SOMEONE}|${SERVICE})`),
  new RegExp(`${DOING} (?:sending|dispatching) (?:you )?(?:help\\b|${SOMEONE}|${SERVICE})`),
  new RegExp(
    `${HAVE} got (?:you )?(?:help\\b|${SOMEONE}|${SERVICE}) (?:coming|on (?:the|its|their) way|en route)`
  ),
];

/** Help is said to be coming, with no "I" in it. */
export const HELP_COMING: readonly RegExp[] = [
  new RegExp(
    `\\b${RESCUE}(?: is|'s| are|'re| will be) (?:on (?:the|its|their) way|coming|en route|being sent)\\b`
  ),
  new RegExp(`\\b${RESCUE}(?: has| have)? been (?:called|sent|dispatched|notified|alerted)\\b`),
  new RegExp(
    `\\b${RESCUE} (?:will|should|'ll) (?:arrive|be there|be here|get there|be with you)\\b`
  ),
];

/** Clauses: punctuation, and "and"/"so"/"but"/"then", so a later "I'm not leaving" excuses nothing. */
export const EMERGENCY_CLAUSES = /[,;:.!—–]| - | (?:and|so|but|then) /;

/**
 * An offer or first-person negation, read only BEFORE the claim's verb: "want
 * me to call 911?" is not a claim; "I've called 911 and I'm not going anywhere" is.
 */
export const OFFER_OR_NOT =
  /\b(?:want me to|should i|shall i|can i|could i|i can|i could|i'd|i would|would you like|do you want|say the word|let me know if|if you(?:'d)? (?:want|like|say)|i can't|i cannot|i couldn't|i won't|i haven't|i didn't|i don't|i'm not|i am not|i wasn't|i never|unable)\b/;

/** Ferni's own past ("I've called an ambulance before, I know how scary it is"). */
export const ANECDOTE =
  /^(?:when|after|before|because|since|as|the time|back when) (?:i|we)\b|\b(?:yesterday|last (?:night|week|month|year|time|summer|winter|spring|fall|autumn)|ago|used to|back when|the other day|years|growing up|as a kid|that day|that night|this one time|before)\b/;

/**
 * A condition: "if you call 911, help is on the way" is advice, not a report.
 * One word list for the sentence's start and for each clause, so a clause read
 * alone (emergencyRemainder) and the same clause inside a sentence agree.
 */
const IF_YOU = '(?:if|once|as soon as) you\\b';
export const CONDITION = new RegExp(`^${IF_YOU}`);
export const CLAUSE_CONDITION = new RegExp(`\\b${IF_YOU}`);

/** The caller (or someone with them) called for help, or says help is coming. */
const CALLED_FOR_HELP = new RegExp(
  `\\b(?:called|rang|phoned|dialed|dialled|calling|dialing|ringing) ${SERVICE}|${HELP_COMING.map((re) => re.source).join('|')}`,
  'i'
);
/** A negation or a question: "I haven't called 911", "nobody's called an ambulance", "is help coming?". */
const NEGATED = /\b(?:no|not|never|nobody|no one|noone|no-one|can't|cannot)\b|n't\b|\?/i;
/** Ferni told the caller to call for help. */
const TOLD_TO_CALL =
  /\b(?:call|dial|ring|phone) (?:911|9-1-1|988|an ambulance|the police|emergency services)\b/i;
/**
 * The whole reply is a short yes to that: "okay I did", "done", "they're coming",
 * "my neighbor is calling them". Not "I have no idea" or "my phone is calling weird".
 */
const DID_CALL = new RegExp(
  `^(?:(?:okay|ok|yes|yeah|yep|alright|all right)\\W*)*(?:i did|did it|done|i(?:'ve| have) called(?: them| ${SERVICE})?|they're coming|they are coming|they're on (?:the|their) way|(?:\\w+ ){0,2}\\w+(?: is| are|'s|'re) calling (?:them|${SERVICE})(?: now| right now)?)\\W*$`,
  'i'
);

/** How many of the caller's latest messages can say help was already called. */
const CALLER_WINDOW = 6;

/** True when the caller's latest messages say help was already called, so "help is on the way" may stand. */
export function helpAlreadyCalled(chatCtx: { items: readonly unknown[] }): boolean {
  const said = recentSpoken(chatCtx, 'user', CALLER_WINDOW).some((text) =>
    text
      .split(/(?<=[.!?])\s+/)
      .filter((sentence) => !sentence.includes('?'))
      .flatMap((sentence) => sentence.split(/[,;]| (?:and|but|so) /))
      .some((clause) => !NEGATED.test(clause) && CALLED_FOR_HELP.test(clause))
  );
  if (said) return true;
  // "Okay, done." right after Ferni said to call 911. Not after the guard's own line: it
  // says "please call 911" to every emergency claim, so a yes to it proves nothing.
  const items = (chatCtx.items as readonly Item[]).filter((item) => item.type === 'message');
  const last = items[items.length - 1];
  const before = items[items.length - 2];
  if (last?.role !== 'user' || before?.role !== 'assistant') return false;
  const answer = plain(spokenOf(last));
  const told = plain(spokenOf(before));
  return (
    TOLD_TO_CALL.test(told) &&
    !told.includes(IN_DANGER_NOW) &&
    !NEGATED.test(answer) &&
    DID_CALL.test(answer)
  );
}

/** True once any of the caller's messages on this call was about an emergency: it stays on. */
export function crisisInPlay(chatCtx: { items: readonly unknown[] }): boolean {
  return recentSpoken(chatCtx, 'user').some((text) => CRISIS.test(text));
}
