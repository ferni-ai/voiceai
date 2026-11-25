/**
 * The caller asked for less (SHORT_ASK=on, off by default; #4383).
 *
 * Red team 2026-11-24 (rt-1124-short-version, 2 of 2 calls): "short version
 * though, I've got like two minutes" got 37 and then 75 words. Only a second
 * push with a literal size ("shorter, like one sentence") got one sentence.
 * The model-shape reminder (turn-shape.ts) says to go longer only when asked,
 * but nothing read an ask for less, so the caller had to ask twice.
 *
 * With the flag on, a caller turn that asks for the short version gets one
 * last reminder line: one sentence, the single most useful thing, no offer
 * and no question. The detector fails closed: it only fires on a direct ask
 * aimed at Ferni's reply, never on a negated one ("don't give me the one
 * liner") or on a caller telling their own story ("the short version is she
 * left", "I told him to keep it short"). A miss costs one long reply, as
 * today; a false hit would clip Ferni while someone is opening up.
 *
 * @module agents/personas/short-ask
 */

import { flagOn, type Env } from '../../config/env-flag.js';

const SHORT_ASK_LINE =
  'They asked for the short version: answer in one sentence with the single most useful thing. No offer, no teammate, no question. This overrides any length or question line above.';

/** Direct asks for a shorter reply, matched on lower-cased text. */
const ASKS: readonly RegExp[] = [
  // "short version though", "give me the quick version" (not "the short version of it is ...")
  /\b(short|quick|brief|abridged)\s+version\b(?!\s*(of|is|was|went)\b)(?!\s*:)/,
  /\bcliff'?s?\s*notes\b(?!\s*(of|is|was)\b)/,
  /\b(keep|make)\s+it\s+(short|quick|brief|snappy)\b/,
  // "in one sentence", "just one line", "one sentence."
  /\b(in|just|give me|only)\s+(one|a single)\s+(sentence|line)\b/,
  /\bone\s+sentence[.!?]*$/,
  /\btl\s*;?\s*dr\b/,
  /\b(just|give me|what'?s)\s+the\s+bottom\s+line\b/,
  // "shorter." opening the turn, or "make it shorter", "say it even shorter"
  /^(okay|ok|um|uh|no|nah|hmm)?[,.\s]*shorter\b/,
  /\b(make|say|keep|go)\s+(it\s+)?(even\s+|way\s+|a\s+bit\s+|a\s+little\s+)?shorter\b/,
];

/**
 * A negation just before the ask, with only the words of an ask between them, undoes it
 * ("I do not want you to give me the short version"). Any other word ends the reach, so
 * "I don't have long so keep it short" still asks.
 */
const NEGATED =
  /\b(don'?t|do not|not|no|never|without|instead of|rather than)\s+((give|giving|want|wanna|need|do|tell|hear|get|just|really|even|please|me|us|you|to|i|it|the|a|any|your|this|that|with)\s+){0,6}$/;

/**
 * "I told my manager twice to just keep it short", "here's the short version": the caller is
 * telling, not asking.
 */
const REPORTED =
  /\b(told|asked|tell|ask|said|says|wants?|wanted)(\s+\w+){1,3}\s+to(\s+(just|really|please|always|also|even))*\s*$|\b(here'?s|here is|that'?s|this is|i'?ll give you|let me give you|i'?ll tell you|i'?ll do)\s+(the|a|my)\s*$/;

/** True when the caller's own turn asks Ferni for a shorter reply. */
function asksForShort(userText: string): boolean {
  const text = userText
    .toLowerCase()
    .replace(/\u2019/g, "'")
    .trim();
  for (const ask of ASKS) {
    const hit = ask.exec(text);
    if (!hit) continue;
    const before = text.slice(0, hit.index);
    if (NEGATED.test(before) || REPORTED.test(before)) continue;
    return true;
  }
  return false;
}

/** The reminder line for this turn, or null (flag off or no ask). */
export function shortAskLine(userText: string, env: Env = process.env): string | null {
  return flagOn('SHORT_ASK', env) && asksForShort(userText) ? SHORT_ASK_LINE : null;
}
