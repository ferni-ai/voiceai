/**
 * CALLER_SETS_DEPTH (off by default): the caller decides how deep heavy news goes.
 *
 * Humanness red team, 2026-10-21 (#2333, 2 of 2 runs): a caller said their dad
 * was moving in because he can't live alone, then "It's fine. It's whatever."
 * and "I don't really want to make a big thing of it." Ferni argued back each
 * time ("That's a lot of weight to brush off", "pretending it's no big deal
 * doesn't make it any lighter to carry"), and the director's notes egged it on
 * ("They used 'whatever' to shrug it off ... sit with the weight", "Hold space
 * for that tension"). The caller felt handled, not heard. A friend takes the
 * cue: one plain line or an easy question about something concrete, or lets
 * it drop.
 *
 * With the flag on:
 *   - callerSetsDepthNote: when the caller's turn declines depth (DECLINES)
 *     and heavy news is in their last few turns (heavyNews), or they
 *     say outright they don't want to make a thing of it, the turn reminder
 *     gets DEPTH_NOTE. Never when the same turn carries distress ("I'm fine, I
 *     just can't stop crying"), and never on a crisis-guided reply.
 *   - labelsDeflection: director notes that name the caller's deflection or
 *     use therapist steering ("shrugged it off", "downplaying", "hold space",
 *     "sit with the weight") are dropped (director-notes.ts parseNotes).
 *
 * @module agents/personas/caller-sets-depth
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import { callerHeavyLately } from '../../speech/tts-gateway/director/emotion-lift.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'CallerSetsDepth' });

export const DEPTH_NOTE =
  "They've just told you how deep they want to go with this. Take their lead: one plain, warm line, or an easy question about something concrete, or let it go and follow them where they go next. " +
  "Don't tell them it's bigger or heavier than they say, and don't name what they're doing with their feelings.";

/** The caller playing heavy news down, or closing it. Whole words. */
const DECLINES =
  /\b(?:it'?s (?:fine|whatever|okay|ok|all good|no big deal|not a big deal)|it is what it is|whatever|no big deal|not a big deal|i'?m (?:fine|okay|ok|good)|anyway|anyways|moving on|let'?s (?:talk about something else|change the subject|move on))\b/i;

/** Saying outright they don't want to go into it: enough on its own. */
const DECLINES_OUTRIGHT =
  /\b(?:don'?t (?:really )?(?:want to|wanna) (?:make a (?:big )?(?:thing|deal) (?:of|out of) it|talk about it|get into it|go into it)|(?:can|could) we (?:talk about something else|change the subject))\b/i;

/** Director notes that label the caller's deflection or steer like a therapist. */
const LABELS_DEFLECTION =
  /\b(?:shrug(?:s|ged|ging)? (?:it |that |this )?off|brush(?:es|ed|ing)? (?:it |that |this )?off|downplay\w*|minimi[sz]\w*|play(?:s|ed|ing)? (?:it|that|this) down|hold(?:ing)? space|sit with (?:the|that|this) (?:weight|tension|feeling|pain))\b/i;

/**
 * Life-change news that callerHeavyLately's mood reading misses: caregiving,
 * a parent's decline, illness, a job or a marriage ending. Whole words.
 */
const LIFE_CHANGE =
  /\b(?:can'?t (?:live|be) (?:alone|on (?:his|her|their) own)|moving in with (?:us|me)|nursing home|assisted living|hospice|dementia|alzheimer'?s|diagnos\w*|cancer|chemo\w*|surgery|stroke|laid off|lost my job|fired|divorc\w*|breaking up|broke up|separat(?:ed|ing)|miscarriage|passed away|funeral)\b/i;

/** Heavy news in these caller turns: the director's mood reading, or a life change. */
function heavyNews(turns: readonly string[]): boolean {
  return callerHeavyLately(turns) || turns.some((t) => LIFE_CHANGE.test(t));
}

/**
 * Distress in the very turn that says "it's fine": then it isn't, and Ferni
 * stays with them. callerHeavyLately reads most of it; these are what it misses.
 */
const DISTRESS =
  /\b(?:alone|lonely|scared|afraid|terrified|crying|cried|tears|can'?t (?:sleep|cope|breathe|stop)|falling apart|overwhelm\w*|numb|empty|panic\w*|hurting|broken|not okay|not fine|struggling)\b/i;

/** Turns of the caller's that heavy news may sit in, this one included. */
const HEAVY_LOOKBACK = 4;

export function callerSetsDepthOn(env: Env = process.env): boolean {
  return flagOn('CALLER_SETS_DEPTH', env);
}

/** A director note that names the caller's deflection or steers like a therapist. */
export function labelsDeflection(note: string): boolean {
  return LABELS_DEFLECTION.test(note);
}

/**
 * The note for this reply, or ''. `callerTurns` are the caller's turns on
 * this call, oldest first, ending with the one this reply answers.
 */
export function callerSetsDepthNote(
  said: string,
  callerTurns: readonly string[],
  opts: { crisis: boolean },
  env: Env = process.env
): string {
  if (opts.crisis || !said || !callerSetsDepthOn(env)) return '';
  // "I'm fine, I just can't stop crying" is not fine: no note, Ferni stays with them.
  if (callerHeavyLately([said]) || DISTRESS.test(said)) return '';
  const outright = DECLINES_OUTRIGHT.test(said);
  if (!outright && !(DECLINES.test(said) && heavyNews(callerTurns.slice(-HEAVY_LOOKBACK))))
    return '';
  log.info({ behaviour: 'caller_sets_depth', outright }, 'Depth note added to the turn reminder');
  return DEPTH_NOTE;
}
