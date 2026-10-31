/**
 * CRISIS_CONTEXT_V2 (off by default): what the crisis classifier counts as
 * evidence on a turn whose own words carry no strong risk phrase.
 *
 * False crisis reads mostly follow an earlier activation on the same call: the
 * classifier reads Ferni's own 988 line or safety question as context, and the
 * prompt lets short follow-ups and EARLIER carry risk forward, so a "yeah", a
 * denial or an errand after one false read reads as crisis again. On such a
 * turn, with the flag on:
 *
 * - Ferni's own crisis line or safety question goes to the model as
 *   COMPANION_CHECK_IN, marked as Ferni's check-in, never as evidence;
 * - EARLIER raises risk only when the caller stated risk there and this turn
 *   continues it; a topic change, an errand, a request for someone else, or a
 *   denial of risk the caller never stated is judged on its own words;
 * - a goodbye or last request is imminent only with the caller's own words
 *   about dying, a plan or means on the call, and the everyday double read
 *   (crisis-everyday.ts) runs only then;
 * - with SEXUAL_TOPIC_BOUNDARY on, sexual or adult content alone is none.
 *
 * A turn whose own words carry a strong risk phrase, or that follows the
 * caller's own strong risk within the classifier's window of earlier lines, is
 * read exactly as with the flag off: no narrowing rule may ever lower it.
 * Anything unexpected here also falls back to that read.
 *
 * @module CrisisContextV2
 */

import { flagOn } from '../../config/env-flag.js';
import type { CrisisGenerateFn } from './crisis-classifier.js';

type Env = Record<string, string | undefined>;

/** Words stating dying, suicide or self-harm, or naming a means. Whole words. */
const STRONG_RISK = new RegExp(
  '\\b(?:' +
    [
      'di(?:e|es|ed|ing)|dead|death|suicid\\w*|kms|ctb|unaliv\\w*|sewer ?slide',
      'kill(?:ing|ed)? (?:my ?self|me)|take my (?:own )?life|end(?:ing)? (?:it|my life|things|everything)',
      "(?:don't|do not|dont|doesn't) want to (?:live|be alive|be here|exist|wake up)|not (?:be|being) (?:here|around|alive)",
      "won't be (?:here|around)|wont be (?:here|around)|better off without me|no reason to (?:live|keep living|go on)|can't go on|goodbye forever",
      '(?:not|never) (?:to )?wake up|wish i (?:was|were) dead|disappear for good|want (?:it|it all|this) to end',
      'pills?|overdos\\w*|gun|pistol|rifle|rope|noose|hang(?:ing)? my ?self|jump(?:ing)? (?:off|from)|bridge|ledge|roof',
      'razor|blade|bleach|poison\\w*|(?:cut|cutting|hurt|hurting|harm|harming|burn|burning) my ?self|self ?harm|carbon monoxide|engine running',
    ].join('|') +
    ')\\b'
);

/** Whether these words state risk strongly. True on any surprise: such a turn is never narrowed. */
export function strongRisk(text: string | undefined): boolean {
  if (typeof text !== 'string') return true;
  try {
    return STRONG_RISK.test(text.normalize('NFKC').toLowerCase().replace(/[’‘]/g, "'"));
  } catch {
    return true;
  }
}

/**
 * With the flag on, whether this turn's read narrows its context: never when its own words, or
 * the caller's earlier lines the classifier reads, carry strong risk. Once the caller has said
 * it, every turn in that window is read exactly as with the flag off.
 */
export function contextNarrows(
  latest: string,
  env: Env = process.env,
  earlier: readonly string[] = []
): boolean {
  return flagOn('CRISIS_CONTEXT_V2', env) && !strongRisk(latest) && !earlier.some(strongRisk);
}

/** Ferni's own crisis line or safety question: the guard's scripts and what guidance asks it to say. */
const FERNI_CHECK_IN =
  /\b988\b|nine eight eight|lifeline|crisis line|\b911\b|741741|emergency room|safe right now|somewhere safe|in danger right now|(?:hurting|killing) yourself|ending your life|thoughts of suicide/i;

const RULES = `
COMPANION_CHECK_IN and EARLIER (these come before the lists below):
- COMPANION_CHECK_IN, when the input has it, is the companion's own crisis line or safety question. The companion says these on its own whenever a read was unsure, so a check-in is never evidence that the caller is at risk. It only tells you what LATEST answers: an answer that admits risk is risk (yes to thoughts of suicide or self-harm, no or not really to being safe), and so is risk in LATEST's own words; anything else is judged on LATEST's own words.
- EARLIER raises the risk of LATEST only when an EARLIER line itself stated risk (dying, suicide, self-harm, not wanting to be alive, a plan or means) and LATEST continues it: a short answer to the companion ("yeah", "no", "not really", "I don't know"), agreement, or more about it. Heavy but ordinary feelings in EARLIER (stress, tiredness, grief, a breakup, loneliness, a bad day) are not risk stated. A caller agreeing with or echoing the companion's own low line is still judged as if they had said it, as above. LATEST does not continue EARLIER when it changes the subject, is an errand or plan, asks for someone else, or denies or clarifies risk the caller never stated ("no, I'm fine, I meant work", "it's not a crisis"): judge it on its own words.
- A goodbye or last request is imminent only when the caller's own words, in LATEST or EARLIER, state dying, a plan or means; then judge it as above. Without such words, "bye", "this is the last one", "I'm done" and "thank you for everything" are risk "none".`;

const SEXUAL_RULE = `
- Sexual, flirtatious or adult-topic questions and requests on their own (dating, sex, attraction, "talk dirty", a romantic or sexy story) are risk "none". Judge only words about dying or self-harm in them.`;

/** The base prompt's imminent goodbye line, and the everyday rules' farewell sentence. */
const GOODBYE_LINE = `- a final goodbye or last request ("won't be here tomorrow", "tell my mom I love her after I'm gone")`;
const FAREWELL = `"this is the last time you'll hear from me").`;
const ON_THE_CALL = " with the caller's own words about dying, a plan or means on the call";

/** The classifier prompt for a narrowed read; the prompt unchanged when an anchor is missing. */
export function narrowedPrompt(prompt: string, env: Env = process.env): string {
  const insertAt = prompt.indexOf('\n\nReturn JSON only');
  if (insertAt < 0 || !prompt.includes(GOODBYE_LINE)) return prompt;
  const rules = RULES + (flagOn('SEXUAL_TOPIC_BOUNDARY', env) ? SEXUAL_RULE : '');
  return (prompt.slice(0, insertAt) + `\n${rules}` + prompt.slice(insertAt))
    .replace(GOODBYE_LINE, GOODBYE_LINE + ON_THE_CALL)
    .replace(FAREWELL, `${FAREWELL.slice(0, -2)}). It counts only${ON_THE_CALL}.`);
}

/** The model call for a narrowed read: Ferni's check-in goes as COMPANION_CHECK_IN. */
export function narrowedGenerate(generate: CrisisGenerateFn): CrisisGenerateFn {
  return (prompt, content, signal) => {
    let input: { latest?: unknown; earlier?: unknown; companion?: unknown };
    try {
      input = JSON.parse(content) as typeof input;
    } catch {
      return generate(prompt, content, signal);
    }
    if (typeof input.companion !== 'string' || !FERNI_CHECK_IN.test(input.companion)) {
      return generate(prompt, content, signal);
    }
    const { companion, ...rest } = input;
    return generate(prompt, JSON.stringify({ ...rest, COMPANION_CHECK_IN: companion }), signal);
  };
}

/** One turn's read under the flag: the prompt and model call it uses (unchanged when not narrowed). */
export function contextV2Read(
  latest: string,
  env: Env = process.env,
  earlier: readonly string[] = []
): { prompt: (p: string) => string; generate: (g: CrisisGenerateFn) => CrisisGenerateFn } {
  if (!contextNarrows(latest, env, earlier)) return { prompt: (p) => p, generate: (g) => g };
  return { prompt: (p) => narrowedPrompt(p, env), generate: narrowedGenerate };
}
