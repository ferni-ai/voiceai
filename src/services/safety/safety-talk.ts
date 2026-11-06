/**
 * Care wording and ways to reach help, as yes/no checks for code that must
 * leave such a line word for word (already-said.ts never names one, nor reads
 * a reply that holds one). They answer "is this safety talk?"; they never read
 * a crisis or decide one.
 *
 * The crisis resources come from CRISIS_RESOURCES and EMERGENCY_NUMBER (their
 * names and numbers), never a copied list. A number on no list (999, 112,
 * 85258, 116 123) is caught by its shape: one to call, text or dial, or any
 * run of three digits.
 *
 * @module services/safety/safety-talk
 */

import { CRISIS_RESOURCES } from './crisis-response.js';
import { EMERGENCY_NUMBER } from './emergency-number.js';

/**
 * Care and safety language no script words: holding someone on the line,
 * sending them to help, telling them they matter. Blunt on purpose: a caller
 * only uses it to leave a line alone.
 */
const CARE =
  /\b(?:please|matters?|worried|scared for|safe\w*|stay (?:with me|on the line|inside|here|put)|lock\w*|trusted|reach out|help|right now|tonight|edge|put (?:it|that|them|the \w+) down|step (?:away|back)|someone you (?:can|could|trust)|talk to someone|alone|believe you|hands on you|hurt you|with other people)\b/i;

/** A number to call, text or dial, or any three digits in a row. */
const A_NUMBER_TO_REACH = /\b(?:call|text|dial|ring|phone|reach)\b[^.!?]*\d|\d{3}/i;

const RESOURCES = Object.values(CRISIS_RESOURCES).flat();
const NAMES = [...new Set(RESOURCES.map((r) => r.name.toLowerCase()))];
const numbersIn = (text = ''): string[] =>
  (text.match(/\d(?:[\d\s-]*\d)?/g) ?? []).map((n) => n.replace(/\D/g, ''));
const NUMBERS = new Set([
  EMERGENCY_NUMBER,
  ...RESOURCES.flatMap((r) => [...numbersIn(r.phone), ...numbersIn(r.text)]),
]);

/** Care or safety wording ("Please stay on the line with me.", "Your life matters to me."). */
export const isCareTalk = (sentence: string): boolean => CARE.test(sentence);

/** A crisis resource by name or number, or any number to call, text or dial. */
export function reachesHelp(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    A_NUMBER_TO_REACH.test(text) ||
    NAMES.some((name) => lower.includes(name)) ||
    numbersIn(text).some((n) => NUMBERS.has(n))
  );
}
