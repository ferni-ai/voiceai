/**
 * Ferni can't see anyone else's conversations, so he never counts, quotes or describes them.
 *
 * #3028: asked how many people ask him things, Ferni said "probably dozens today" and
 * "thousands and thousands" last year, and listed three questions other callers supposedly
 * asked "earlier today". Nothing he can see holds that, and it tells the caller he talks
 * about other people's conversations. Director notes pushed it on ("give a real estimate",
 * "answer their direct question about what people asked today").
 *
 * NO_INVENTED_USAGE=on adds USAGE_HONESTY to the honesty rule (ai-honesty.ts), tells the
 * director the same, and drops a note that still asks for a usage number or other callers'
 * questions (director-guard.ts). Sibling of no-invented-internals.ts (#2223).
 *
 * @module agents/personas/no-invented-usage
 */

import { flagOn, type Env } from '../../config/env-flag.js';

export function noInventedUsageEnabled(env: Env = process.env): boolean {
  return flagOn('NO_INVENTED_USAGE', env);
}

const USAGE_HONESTY = `You can't see anyone else's conversations, and you never count, quote or describe them. Asked how many people you talk to, how often something comes up, or what other people ask you, give no number, estimate or example, and never say "every day" or "earlier today" about them: you may say you talk with lots of people and that each conversation stays with the person it's with, so you couldn't say. Then turn back to them ("Honestly, I couldn't tell you; every conversation stays with the person it's with. What got you wondering?").`;

/** USAGE_HONESTY when the flag is on, for the honesty rule (ai-honesty.ts withHonesty). */
export const usageHonestyLine = (env: Env = process.env): string =>
  noInventedUsageEnabled(env) ? USAGE_HONESTY : '';

/** The director's half: never ask for what he can't see (director-guard.ts guardRuleFor). */
export const usageDirectorRule = (name: string, object: string): string =>
  `${name} can't see anyone else's conversations: never ask for a number or estimate of how many people talk to ${object}, or for what other callers said.`;

/**
 * Every gap between the words a pattern looks for is bounded and every input is capped, so a
 * long caller turn can't make a failed match backtrack for seconds (an unbounded gap between
 * two or three words is cubic in the input). Questions are short; a longer stretch isn't one.
 */
const GAP = String.raw`[^.?!]{0,60}`;
const NOTE_GAP = String.raw`[^.]{0,80}`;
/** The most of the caller's turn that is read: its end, where the question usually is. */
const MAX_SAID_CHARS = 600;
const MAX_NOTE_CHARS = 600;

/** The caller asking how many people talk to Ferni, or what other people ask or tell him. */
const ASKS_USAGE = new RegExp(
  [
    String.raw`\bhow (?:many|much|often)\b${GAP}\b(?:people|users|folks|others|callers|teens|kids|everyone|anyone)\b${GAP}\b(?:you|ferni)\b`,
    String.raw`\bhow (?:many|much|often)\b${GAP}\b(?:you|ferni)\b${GAP}\b(?:people|users|folks|callers|questions|calls)\b`,
    String.raw`\b(?:what|which)\b${GAP}\b(?:people|others|callers|users|folks)\b${GAP}\b(?:ask|say|tell|talk|want)\w*\b${GAP}\b(?:you|ferni)\b`,
    String.raw`\b(?:do|does|did)\b${GAP}\b(?:people|others|teens|kids|users|callers|anyone)\b${GAP}\b(?:ask|tell|talk to|call|use)\w* (?:you|ferni)\b`,
    String.raw`\b(?:other|another) (?:people|callers|users|person|caller)\b${GAP}\b(?:you|ferni)\b`,
  ].join('|'),
  'i'
);
/** A note naming other callers or Ferni's usage outright ("what people asked today"); notes call Ferni "you". */
const NAMES_OTHERS = new RegExp(
  [
    String.raw`\bother (?:callers|users)`,
    String.raw`\byour (?:other )?(?:callers|users)`,
    String.raw`\bwhat (?:other )?(?:people|callers|users|folks) (?:ask|asked|said|say)\b${NOTE_GAP}\btoday`,
    String.raw`\bhow many (?:people|callers|users|folks) (?:you|ferni)\b`,
    String.raw`\b(?:people|callers|users|folks) (?:ask|asked|tell|told|talk to|use|call) (?:you|ferni)\b${NOTE_GAP}\b(?:how many|how often|every day|today|examples?)\b`,
  ].join('|'),
  'i'
);
/** A note asking for a figure or an answer: after a usage question, that is a push to invent. */
const WANTS_FIGURE =
  /\b(?:estimate|number|figure|count|stats?|ballpark|examples?|specific|answer|how (?:many|often))\b/i;

const asksAboutUsage = (said: string): boolean =>
  ASKS_USAGE.test(said.slice(-MAX_SAID_CHARS).replace(/’/g, "'"));

/**
 * A director note that would push Ferni to count or quote other callers: one naming them,
 * or, after the caller asked about them (`said`), one asking for a figure or an answer.
 */
export function pushesUsage(note: string, said = ''): boolean {
  const text = note.slice(0, MAX_NOTE_CHARS).replace(/[‘’]/g, "'");
  return NAMES_OTHERS.test(text) || (asksAboutUsage(said) && WANTS_FIGURE.test(text));
}
