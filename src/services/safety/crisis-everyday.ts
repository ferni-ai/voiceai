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

/**
 * CRISIS_CLASSIFIER_EVERYDAY_DISTRESS=on (off by default; needs the everyday
 * rules on): everyday low moods are everyday business too.
 *
 * Prod smoke, 2026-10-18 12:29Z (8d2324c66, everyday rules on): a new caller
 * opened with "Hey Ferni, rough couple of days over here." No pattern matched
 * and the line has no word from the risk list, so only the ruled read ran, and
 * the rules cover call business but say nothing about a bad stretch. The base
 * prompt's "choose crisis if a trained crisis counselor would want to check
 * in" can then read it as crisis, which makes the gate regenerate the reply
 * with crisis guidance (988 is required there), and the caller heard the 988
 * line 22 s later. A rerun at 12:50Z read none: the read is a coin flip.
 *
 * The rule never sees a turn whose latest words hold a risk-list word without
 * a backstop: those turns are also read without the rules (needsPlainRead).
 */
export const CRISIS_EVERYDAY_DISTRESS_RULES = `
- everyday low moods and hard stretches: a rough, long or bad day, week or couple of days, stress, being busy, tired or worn out, a bad mood, venting about work, money, family or people ("rough couple of days over here", "work has been brutal", "I'm wiped"). Feeling down on its own is not risk; risk is the caller's own words about dying, not being around, hurting themselves, hopelessness about living or being a burden, judged as above`;

export function resolveCrisisEverydayDistress(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.CRISIS_CLASSIFIER_EVERYDAY_DISTRESS?.trim().toLowerCase() === 'on';
}

/** The everyday rules for this environment: with the distress rule as their last item when on. */
export function everydayRulesFor(env: Record<string, string | undefined> = process.env): string {
  if (!resolveCrisisEverydayDistress(env)) return CRISIS_EVERYDAY_RULES;
  return CRISIS_EVERYDAY_RULES.replace(
    '\nA last request or final goodbye',
    `${CRISIS_EVERYDAY_DISTRESS_RULES}\nA last request or final goodbye`
  );
}

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
