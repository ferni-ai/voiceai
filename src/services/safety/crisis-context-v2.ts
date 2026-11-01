/**
 * CRISIS_CONTEXT_V2 (off by default): what the crisis classifier counts as
 * evidence on a turn of a call where the caller has said nothing strongly risky.
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
 * - with SEXUAL_TOPIC_BOUNDARY on, sexual or adult content alone is none.
 *
 * Nothing is narrowed on a turn whose own words, or any earlier caller line on
 * the call, carry a strong risk phrase: dying, suicide, self-harm, a means, a
 * final goodbye or a preparatory act. Such a turn, and every later turn of
 * that call, is read exactly as with the flag off. Goodbyes are always judged
 * by main's rules. Anything unexpected here also falls back to main's read.
 *
 * @module CrisisContextV2
 */

import { flagOn } from '../../config/env-flag.js';
import { callNarrowingHeld, holdCallNarrowing } from './crisis-call-risk.js';
import type { CrisisGenerateFn } from './crisis-classifier.js';

type Env = Record<string, string | undefined>;

/** Strong risk phrases, whole words: no narrowing rule may ever lower a call that holds one. */
const STRONG_RISK_PHRASES = [
  // Dying, suicide, not wanting to be alive.
  'di(?:e|es|ed|ing)|dead|death|suicid\\w*|kms|ctb|unaliv\\w*|sewer ?slide|off my ?self|end my ?self',
  'kill(?:ing|ed)? (?:my ?self|me)|take my (?:own )?life|end(?:ing)? (?:it|it all|my life|things|everything)',
  "(?:don'?t|do not|doesn'?t) (?:want|wanna) (?:to )?(?:live|be alive|be here|exist|wake up|go on)",
  "not (?:be|being) (?:here|around|alive)|won'?t be (?:here|around)|better off without me|can'?t go on",
  'no reason to (?:live|keep living|go on)|goodbye forever|(?:go|going|gone) away forever',
  '(?:not|never) (?:to )?wake up|stay asleep|wish i (?:was|were) dead|disappear for good',
  '(?:want|wish) (?:to|i could) (?:just )?disappear|want (?:it|it all|this|everything) to (?:end|stop)',
  "(?:can'?t|cannot) (?:take|do) (?:it|this) any ?more|no way out|hopeless|burden",
  '(?:see|is) (?:the|no) point (?:of|in) (?:anything|living|life|going on)|no point any ?more',
  'never (?:going to )?get better|(?:nothing|it) is ever going to get better',
  "(?:miss|notice) (?:me )?if i (?:was|were) gone|(?:after|before|when|once) i'?m gone",
  "if i (?:was|were|wasn'?t) (?:gone|here|around)|(?:wasn'?t|weren'?t|not) in the picture",
  '(?:those|these|suicidal|dark) thoughts|thoughts again',
  // Means.
  'pills?|tablets|overdos\\w*|whole bottle|sleeping (?:meds|medication|medicine)|took all (?:of )?them',
  'gun|pistol|rifle|rope|noose|hang(?:ing)? my ?self|jump(?:ing)? (?:off|from|in front)',
  'step(?:ping)? in front of|bridge|ledge|roof|overpass|train platform|razor|blade|bleach|poison\\w*',
  'knife (?:in my hand|next to me|to my|on my)|bleed(?:ing)? out|carbon monoxide|engine running',
  'running in the garage|(?:drive|drove|crash) (?:my car|it|myself) into',
  // Self-harm, including ongoing.
  '(?:cut|cutting|hurt|hurting|harm|harming|burn|burning) my ?self|self ?harm',
  '(?:keep|kept|been|started|start) (?:cutting|burning|hurting)|cutting again',
  // Final goodbyes.
  "my last call|this is (?:my|the) last (?:call|time)(?! for)|(?:won'?t|will not|never) hear from me again",
  "last time (?:you'?ll|you will) (?:hear from|talk to|see) me|won'?t (?:see|make it to) (?:it|tomorrow)",
  "won'?t be (?:a problem|a burden|in the way)|i'?m (?:so )?done with (?:life|living|everything|it all)",
  "i'?m (?:so )?done(?=\\s*[.!]*\\s*$)|i'?m (?:so )?done[.,!]+\\s*(?:good ?bye|bye|thank)",
  'thank you for everything(?=.*\\b(?:good ?bye|bye|farewell)\\b)|(?:good ?bye|bye)\\b.*thank you for everything',
  // Preparatory acts.
  'letters? (?:for|to) (?:everyone|everybody|each of|all of|my )|wrote (?:a |my )?(?:note|letters?) (?:for|to)',
  '(?:find|found|left|leave|leaving) (?:the|a|my) note|affairs in order|passwords?\\b.*\\bjust in case',
  '(?:saving|saved|save|stockpil\\w*|hoard\\w*)(?: up)? (?:all )?(?:my )?(?:meds|medication|medicine|prescriptions?)',
  'stopped taking my (?:meds|medication|pills)|cancel+ed (?:my )?therapy',
  '(?:gave|giving|give|given) away (?:my|all my)\\b|gave my (?:dog|cat|pets?|guitar|records|books|things|stuff|car) (?:to|away)',
  "won'?t need (?:them|it|these|my \\w+) any ?more|won'?t need (?:them|it)(?=\\s*[.!]*\\s*$)",
  // Other languages: matched by meaning, never narrowed.
  'morir\\w*|muerto|matar\\w*|mourir|tuer|sterben|umbringen|morire|uccid\\w*',
];
const STRONG_RISK = new RegExp(`\\b(?:${STRONG_RISK_PHRASES.join('|')})\\b`);
/** Text these words cannot read (accents, other scripts): never narrowed. */
const UNREADABLE = /[^\x20-\x7E\t\n\r’‘“”—–…]/;

/** Whether these words state risk strongly. True on any surprise: such a call is never narrowed. */
export function strongRisk(text: string | undefined): boolean {
  if (typeof text !== 'string') return true;
  try {
    if (UNREADABLE.test(text)) return true;
    return STRONG_RISK.test(text.normalize('NFKC').toLowerCase().replace(/[’‘]/g, "'"));
  } catch {
    return true;
  }
}

/**
 * With the flag on, whether this turn's read narrows its context. Never without a call to hold
 * (no session id), never when this turn's words, an earlier caller line or the patterns carry
 * risk, and never again on a call where one did: the hold lives with the call's risk record
 * (crisis-call-risk.ts) for the whole call.
 */
export function contextNarrows(
  latest: string,
  env: Env = process.env,
  earlier: readonly string[] = [],
  call?: string,
  patternRisk = false
): boolean {
  if (!flagOn('CRISIS_CONTEXT_V2', env) || !call) return false;
  if (patternRisk || strongRisk(latest) || earlier.some(strongRisk)) {
    holdCallNarrowing(call);
    return false;
  }
  return !callNarrowingHeld(call);
}

/** Ferni's own crisis line or safety question: the guard's scripts and what guidance asks it to say. */
const FERNI_CHECK_IN =
  /\b988\b|nine eight eight|lifeline|crisis line|\b911\b|741741|emergency room|safe right now|somewhere safe|in danger right now|(?:hurting|killing) yourself|ending your life|thoughts of suicide/i;

const RULES = `
COMPANION_CHECK_IN and EARLIER (these come before the lists below):
- COMPANION_CHECK_IN, when the input has it, is the companion's own crisis line or safety question. The companion says these on its own whenever a read was unsure, so a check-in is never evidence that the caller is at risk. It only tells you what LATEST answers: an answer that admits risk is risk (yes to thoughts of suicide or self-harm, no or not really to being safe), and so is risk in LATEST's own words; anything else is judged on LATEST's own words.
- EARLIER raises the risk of LATEST only when an EARLIER line itself stated risk (dying, suicide, self-harm, not wanting to be alive, a plan or means) and LATEST continues it: a short answer to the companion ("yeah", "no", "not really", "I don't know"), agreement, or more about it. Heavy but ordinary feelings in EARLIER (stress, tiredness, grief, a breakup, loneliness, a bad day) are not risk stated. A caller agreeing with or echoing the companion's own low line is still judged as if they had said it, as above. LATEST does not continue EARLIER when it changes the subject, is an errand or plan, asks for someone else, or denies or clarifies risk the caller never stated ("no, I'm fine, I meant work", "it's not a crisis"): judge it on its own words.`;

const SEXUAL_RULE = `
- Sexual, flirtatious or adult-topic questions and requests on their own (dating, sex, attraction, "talk dirty", a romantic or sexy story) are risk "none". Judge only words about dying or self-harm in them.`;

/** The classifier prompt for a narrowed read; the prompt unchanged when its anchor is missing. */
export function narrowedPrompt(prompt: string, env: Env = process.env): string {
  const insertAt = prompt.indexOf('\n\nReturn JSON only');
  if (insertAt < 0) return prompt;
  const rules = RULES + (flagOn('SEXUAL_TOPIC_BOUNDARY', env) ? SEXUAL_RULE : '');
  return `${prompt.slice(0, insertAt)}\n${rules}${prompt.slice(insertAt)}`;
}

/** The model call for a narrowed read: Ferni's check-in goes as COMPANION_CHECK_IN. */
function narrowedGenerate(generate: CrisisGenerateFn): CrisisGenerateFn {
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

/**
 * One turn's read under the flag: the prompt and model call it uses (unchanged when not narrowed).
 * Call it before anything can skip the read, so a call with risk is always held.
 */
export function contextV2Read(
  turn: { latest: string; earlier?: readonly string[]; companion?: string },
  run: { call?: string; pattern: 'block' | 'crisis' | 'none' },
  env: Env = process.env
): { prompt: (p: string) => string; generate: (g: CrisisGenerateFn) => CrisisGenerateFn } {
  const latest = turn.latest.trim();
  const earlier = turn.earlier ?? [];
  const narrows = contextNarrows(latest, env, earlier, run.call, run.pattern !== 'none');
  // The rules only speak to EARLIER and Ferni's check-in: with neither, the read stays main's.
  const context =
    earlier.some((line) => line.trim() && line.trim() !== latest) ||
    FERNI_CHECK_IN.test(turn.companion ?? '');
  if (!narrows || !context) {
    return { prompt: (p) => p, generate: (g) => g };
  }
  return { prompt: (p) => narrowedPrompt(p, env), generate: narrowedGenerate };
}
