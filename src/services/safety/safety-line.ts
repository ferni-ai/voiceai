/**
 * Whether a sentence gives a crisis or emergency line: a crisis line in any
 * form offersCrisisLine reads (988, the Crisis Text Line, a line by name), the
 * emergency number (EMERGENCY_NUMBER as digits, "9-1-1", "nine one one"), or
 * emergency help by name ("an ambulance", "the emergency room", "emergency
 * services", "poison control").
 *
 * For readers outside safety that must leave such a sentence as the model wrote
 * it: the action-claim guard never drops guidance like "If the chest pain comes
 * back tonight, call 911." for naming a later time
 * (agents/personas/action-promises.ts setForLater). Reading too much here only
 * leaves a sentence as main has it.
 *
 * @module services/safety/safety-line
 */
import { offersCrisisLine } from './crisis-line-speech.js';
import { EMERGENCY_NUMBER } from './emergency-number.js';

/** 911, 9-1-1 or 9 1 1, not part of a longer number or an amount. */
const DIGITS = `(?<![\\w$€£#])${EMERGENCY_NUMBER.split('').join('[\\s-]?')}(?!\\w)`;
const EMERGENCY = new RegExp(
  `${DIGITS}|\\bnine[\\s-]+one[\\s-]+one\\b|\\bambulance\\b|\\bemergency (?:room|services|line|number)\\b|\\bpoison control\\b`,
  'i'
);

/** Whether `text` gives a crisis or emergency line (see the module note). */
export function namesSafetyLine(text: string): boolean {
  return offersCrisisLine(text) || EMERGENCY.test(text);
}
