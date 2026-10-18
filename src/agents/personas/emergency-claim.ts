/**
 * Ferni never says help is coming when nobody sent it (#1553).
 *
 * Ferni cannot reach emergency services: checkDialableNumber
 * (utils/dialable-number.ts) refuses 911, 988 and every N11 number, so no tool
 * on any call makes "I'm calling an ambulance now", "Calling 911." or "Help is
 * on the way." true. A caller in crisis who hears one waits for help that is
 * not coming. action-claims.ts reads these as call claims, and the guard
 * (action-claim-guard.ts) always swaps them for EMERGENCY_LINE, whatever the
 * call's tools did. The one exception: "help is on the way" stands when the
 * caller has said they (or someone with them) already called for help.
 *
 * The patterns read lower-case clauses, as action-claims.ts normalizes them.
 *
 * @module agents/personas/emergency-claim
 */
import { IN_DANGER_NOW } from '../safety/crisis-guard.js';

/** What Ferni says in place of an emergency claim: nobody was called, and where to turn now. */
export const EMERGENCY_LINE = `I can't call emergency services for you, so I haven't called anyone. If you're in danger right now, ${IN_DANGER_NOW}`;

const HAVE = "\\b(?:i've|i have|we've|i just|i've just|i already|i've already)";
const DOING = "\\b(?:i'm|i am|we're)(?: just| now| already)?";
const LEAD =
  "^(?:(?:okay|ok|alright|all right|right|on it|i'm on it|hang on|stay with me|hold on)\\W+)*";
const NOW = '(?: (?:now|right now|right away|immediately))?';
/** Emergency services, as a caller or Ferni would name them. */
const SERVICE =
  '(?:(?:an|the) )?(?:ambulance|paramedics|emts?|police|cops|fire (?:department|brigade)|emergency services|emergency(?! contacts?\\b)|911|nine one one|999|112)\\b';
/** Who is coming: help, or a service. */
const RESCUE = `(?:help|${SERVICE})`;

/** Ferni says he called, or is calling, emergency services. */
export const EMERGENCY_CALLED: readonly RegExp[] = [
  new RegExp(
    `${HAVE} (?:called|rung|rang|phoned|dialed|dialled|contacted|alerted|notified|sent for) ${SERVICE}`
  ),
  new RegExp(
    `${DOING} (?:calling|ringing|dialing|dialling|phoning|contacting|alerting|getting|sending for) ${SERVICE}`
  ),
  // A plain future is a promise Ferni can't keep, and the caller may wait on it.
  new RegExp(
    `\\b(?:let me|i'm going to|i'm gonna|i'll|i will) (?:call|ring|dial|phone|contact|alert|get) ${SERVICE}`
  ),
  new RegExp(`\\bi (?:called|phoned|dialed|dialled|rang) ${SERVICE} for you\\b`),
  new RegExp(`${LEAD}(?:calling|dialing|dialling|ringing|phoning) ${SERVICE}${NOW}\\W*$`),
  new RegExp(`${HAVE} (?:sent|dispatched) (?:help|someone)\\b`),
];

/** Help is said to be coming, with no "I" in it. */
export const HELP_COMING: readonly RegExp[] = [
  new RegExp(
    `\\b${RESCUE}(?: is|'s| are|'re| will be) (?:on (?:the|its|their) way|coming|en route|being sent)\\b`
  ),
  new RegExp(`\\b${RESCUE}(?: has| have)? been (?:called|sent|dispatched)\\b`),
];

/**
 * Ferni's own past ("I've called an ambulance before, I know how scary it is").
 * Narrower than action-claims' NOT_AN_ACTION: "I've called the police too" is a claim here.
 */
export const ANECDOTE =
  /^(?:and |but |so )?(?:when|after|before|because|since|as|the time|back when) (?:i|we)\b|\b(?:yesterday|last (?:night|week|month|year|time|summer|winter|spring|fall|autumn)|ago|used to|back when|the other day|years|growing up|as a kid|that day|that night|this one time|before)\b/;

/** A condition: "if you call 911, help is on the way" is advice, not a report. */
export const CONDITION = /^(?:and |but |so )?(?:if|once|when|as soon as|after) you\b/;
export const CLAUSE_CONDITION = /\b(?:if|once|as soon as) you\b/;

/** The caller (or someone with them) already called for help, or said help is coming. */
const CALLED_FOR_HELP = new RegExp(
  `\\b(?:called|rang|phoned|dialed|dialled|calling|dialing) ${SERVICE}|${HELP_COMING.map((re) => re.source).join('|')}`,
  'i'
);

/** How many of the caller's latest messages can say help was already called. */
const CALLER_WINDOW = 6;

interface Item {
  type?: string;
  role?: string;
  textContent?: string;
  content?: unknown;
}

const wordsOf = (item: Item): string =>
  item.textContent ??
  (Array.isArray(item.content)
    ? item.content.filter((part): part is string => typeof part === 'string').join(' ')
    : '');

/** True when the caller's latest messages say help was already called, so "help is on the way" may stand. */
export function helpAlreadyCalled(chatCtx: { items: readonly unknown[] }): boolean {
  return (chatCtx.items as readonly Item[])
    .filter((item) => item.type === 'message' && item.role === 'user')
    .slice(-CALLER_WINDOW)
    .some((item) => CALLED_FOR_HELP.test(wordsOf(item).replace(/[‘’]/g, "'")));
}
