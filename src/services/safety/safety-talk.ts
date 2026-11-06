/**
 * Safety talk as yes/no checks, for code that must leave such a line word for
 * word (already-said.ts never names one, nor reads a reply that reaches help).
 * They answer "is this safety talk?"; they never read a crisis or decide one.
 *
 * - reachesHelp: a way to reach help. A crisis line in any written form
 *   (offersCrisisLine), a crisis resource by name or number (CRISIS_RESOURCES,
 *   EMERGENCY_NUMBER), an emergency or crisis line abroad, in digits or words
 *   ("Ring nine nine nine."), or the emergency services ("Get to the ER.").
 *   Ordinary numbers ("$120", "room 204", "call you back at 6") are not.
 * - isSafetyTalk: any of that, care wording, or a means or grounding line
 *   ("Put the knife away.", "Breathe in slowly with me.").
 *
 * When in doubt a line is safety talk: the cost is only a line left unnamed.
 *
 * @module services/safety/safety-talk
 */

import { offersCrisisLine } from './crisis-line-speech.js';
import { CRISIS_RESOURCES } from './crisis-response.js';
import { EMERGENCY_NUMBER } from './emergency-number.js';

/**
 * Care and safety language no script words: holding someone on the line,
 * sending them to help, telling them they matter. Blunt on purpose: a caller
 * only uses it to leave a line alone.
 */
const CARE =
  /\b(?:please|matters?|worried|scared for|safe\w*|stay (?:with me|on the line|inside|here|put)|lock\w*|trusted|reach out|help|right now|tonight|edge|put (?:it|that|them|the \w+) down|step (?:away|back)|someone you (?:can|could|trust)|talk to someone|alone|believe you|hands on you|hurt you|with other people)\b/i;

/** Means taken away and grounding: the knife, the window, the bridge, a slow breath. */
const MEANS_OR_GROUNDING =
  /\b(?:knife|knives|blade|razor|window|ledge|bridge|roof|balcony|railing|put (?:it|that|them|the \w+) away|breath\w*|feet on the floor|things you can (?:see|hear|touch))\b/i;

/** The emergency services, by any name a reply uses for them. */
const EMERGENCY_SERVICES =
  /\b(?:police|ambulances?|paramedics?|first responders?|urgent care|emergency services)\b/i;
/** The same, where only the capitals tell it from a word ("Get to the ER.", "Go to A&E."). */
const EMERGENCY_INITIALS = /\b(?:ER|EMTs?|A ?(?:&|and) ?E)\b/;

/**
 * Emergency and crisis lines on no kernel list: 999, 112, 000 and 111 (UK, EU,
 * Australia), Samaritans 116 123, Shout 85258, Lifeline Australia 13 11 14 and
 * Childline 0800 1111. Named lines abroad go with them.
 */
const LINES_ABROAD = ['999', '112', '000', '111', '116123', '85258', '131114', '08001111'];
const NAMES_ABROAD = /\b(?:samaritans|childline|kids help phone)\b/i;
/** Shout (85258) by name; capitalised only, so "don't shout" is no resource. */
const SHOUT = /\b(?:Shout|SHOUT)\b/;

const RESOURCES = Object.values(CRISIS_RESOURCES).flat();
const NAMES = [...new Set(RESOURCES.map((r) => r.name.toLowerCase()))];

/**
 * Each run of digits, alone and with its spaced or dashed parts joined
 * ("116 123" is 116, 123 and 116123). Never a part of an amount, a time or a
 * longer number: "$1,000" holds no 000, "9:11" no 911.
 */
const runsIn = (text = ''): string[] =>
  text.match(/(?<![\d$€£.,:])\d(?:[\d \t-]*\d)?(?![\d%]|[.,:]\d)/g) ?? [];
const joined = (run: string): string => run.replace(/\D/g, '');
const numbersIn = (text: string): string[] =>
  runsIn(text).flatMap((run) => [joined(run), ...run.split(/[ \t-]+/)]);

const HELP_NUMBERS = new Set([
  EMERGENCY_NUMBER,
  ...LINES_ABROAD,
  ...RESOURCES.flatMap((r) => [...runsIn(r.phone), ...runsIn(r.text)].map(joined)),
]);

const DIGIT_WORDS = [
  '(?:zero|oh|o)',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
];
/** A help number said in words, one digit at a time ("nine one one"), or "triple nine". */
const SPOKEN_NUMBER = new RegExp(
  [
    ...[...HELP_NUMBERS].map((n) =>
      [...n].map((d) => DIGIT_WORDS[Number(d)]).join(String.raw`[\s,-]+`)
    ),
    String.raw`triple[\s-]+(?:nine|zero|one)`,
    String.raw`nine[\s-]+eleven`,
  ]
    .map((n) => String.raw`\b${n}\b`)
    .join('|'),
  'i'
);

/** Care or safety wording ("Please stay on the line with me.", "Your life matters to me."). */
export const isCareTalk = (sentence: string): boolean => CARE.test(sentence);

/** A way to reach help: a crisis line, a resource or help line by name or number, or the emergency services. */
export function reachesHelp(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    offersCrisisLine(text) ||
    EMERGENCY_SERVICES.test(text) ||
    EMERGENCY_INITIALS.test(text) ||
    NAMES_ABROAD.test(text) ||
    SHOUT.test(text) ||
    NAMES.some((name) => lower.includes(name)) ||
    numbersIn(text).some((n) => HELP_NUMBERS.has(n)) ||
    SPOKEN_NUMBER.test(text)
  );
}

/** Safety talk of any kind: a way to reach help, care wording, or a means or grounding line. */
export const isSafetyTalk = (sentence: string): boolean =>
  reachesHelp(sentence) || isCareTalk(sentence) || MEANS_OR_GROUNDING.test(sentence);
