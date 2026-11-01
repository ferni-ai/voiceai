/**
 * Crisis classifier: everyday call business (CRISIS_CLASSIFIER_EVERYDAY_RULES=on,
 * off by default).
 *
 * Prod, 2026-10-14/15: a caller asked Ferni to phone a parent with a greeting,
 * gave the number and hung up; on the next call he asked whether that call was
 * happening and said something about how they were talking. No pattern matched
 * and nothing in his words was about risk, yet reads came back crisis and
 * imminent (the prompt's "last request" and "final goodbye"), and he heard the
 * 988 line and the 911 script.
 *
 * The rules are prompt text, so the model can over-apply them (safety review,
 * 2026-10-17: "I'm giving my stuff away Friday" fell from imminent to crisis).
 * The backstop bounds that: when the caller's latest words hold any word from
 * the agreement gate's risk list, the turn is also read without these rules and
 * the more severe read wins. On those turns the rules can only add, never
 * lower. Turns with none of those words are where the rules do their work.
 *
 * @module CrisisEveryday
 */

import { hasRiskContent } from './crisis-agreement.js';
import type { CrisisVerdict } from './crisis-classifier.js';

export const CRISIS_EVERYDAY_RULES = `
Everyday call business is risk "none" unless the caller's own words, in LATEST or EARLIER, carry risk as above:
- asking the companion to call, text or check in on someone (a parent, a friend), which is not worry that they are at risk unless the caller says so, giving a phone number, passing on everyday words ("say hello for me"), or asking whether that call is happening ("is it going through?", "still waiting", "okay, do it"). If the caller says they won't be there to do it themselves (won't be able to, won't be around, someone else will have to from now on, after this), that is a last request, not call business: judge it as above
- ending the call the usual way ("okay, bye", "talk later")
- remarks about the conversation itself: whether the caller or the companion is still there, online, real, listening or a friend, how the two of them are talking, or what the companion meant ("what do you mean?", "why are you saying that?")
- everyday plans and numbers: retirement, money, work, projects, ages and dates ("maybe at 60", "help me map out a budget")
A last request or final goodbye is about not being around afterwards ("tell my mom I love her after I'm gone", "this is the last time you'll hear from me"). These rules only decide between everyday business and risk. They never lower imminent to crisis. A message the caller wants passed on that sounds like a farewell (love, forgiveness, regret for everything, who gets their things) is not everyday words: judge it as above. The companion's call handling and reassurance (staying on the line, "hang in there", "hang tight", promising to call back) and safety talk it started on its own (a check-in, a crisis line) are not signs that the caller is at risk; what the caller says back to them is judged as the caller's words.`;

export function resolveCrisisEverydayRules(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.CRISIS_CLASSIFIER_EVERYDAY_RULES?.trim().toLowerCase() === 'on';
}

/** With the rules on, whether this turn is also read without them. */
export function needsPlainRead(
  latest: string,
  env: Record<string, string | undefined> = process.env
): boolean {
  return resolveCrisisEverydayRules(env) && hasRiskContent(latest);
}

const SEVERITY = { none: 0, crisis: 1, imminent: 2 } as const;

/**
 * The more severe of a read with the rules and one without. A missing read
 * (timeout, error) is kept as missing unless the other read found risk, so a
 * failed plain read never lets a "none" stand alone.
 */
export function moreSevereRead(
  ruled: CrisisVerdict | null,
  plain: CrisisVerdict | null
): CrisisVerdict | null {
  if (!ruled || !plain) {
    const other = ruled ?? plain;
    return other && other.risk !== 'none' ? other : null;
  }
  return SEVERITY[plain.risk] > SEVERITY[ruled.risk] ? plain : ruled;
}
