/**
 * A bare request to reach someone gets a soft check, not the 988 line.
 *
 * Prod call 2026-10-14 (#1415, synthetic paraphrase): after a cool "are you
 * my friend? / I don't think you're my friend" exchange, the caller started
 * "if you call my mom," and was cut off. The patterns passed it; the semantic
 * classifier read it as crisis (a last request?), and Ferni answered with the
 * Suicide and Crisis Lifeline, then repeated it at goodbye.
 *
 * A turn is softened only when ALL of these hold, so nothing else can change:
 * - the patterns found nothing, and no classifier read is imminent;
 * - the caller's whole message is a request to call or text someone, with at
 *   most their number ("can you call my dad for me?", "if you ring my sister,");
 *   any other words ("...and tell her I'm sorry", "if anything happens to me")
 *   mean it is not bare;
 * - no risk content (crisis-agreement.ts hasRiskContent, broad on purpose)
 *   in their message or anything they said earlier in the call; nothing about
 *   safety, a crisis line, dying, harm or giving up in what Ferni just said;
 *   and they are not agreeing with Ferni's line.
 * Then the reply stays in the conversation and, if the request was cut off,
 * asks them to finish; a crisis read is never dropped silently. A bare
 * goodbye under the same conditions gets an ordinary goodbye.
 *
 * Changing the classifier prompt instead was measured and rejected: every
 * wording that cleared these requests also cleared some true-risk lines.
 * Off by default: CRISIS_RELAY_SOFT=on turns it on; unset or off, every
 * classifier crisis escalates exactly as before.
 *
 * @module CrisisRelay
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import type { CrisisVerdict, PatternOutcome } from './crisis-classifier.js';
import { endorses, hasRiskContent } from './crisis-agreement.js';
import { detectCrisis } from './crisis-guard.js';

export function crisisRelaySoftEnabled(env: Env = process.env): boolean {
  return flagOn('CRISIS_RELAY_SOFT', env);
}

const DIGIT = '(?:zero|oh|one|two|three|four|five|six|seven|eight|nine|\\d+)';
const NUMBER = `(?:${DIGIT}(?: |-)?)+`;
const WHO =
  '(?:(?:my|our) (?:\\w+ ){0,2}?(?:mom|mum|mother|mama|dad|father|papa|sister|brother|sis|bro|grandma|grandmother|gran|nana|grandpa|grandfather|aunt|auntie|uncle|cousin|wife|husband|partner|girlfriend|boyfriend|son|daughter|friend|bestie|roommate|neighbou?r)|her|him|them|name)';
const LEAD =
  '(?:(?:hey|so|okay|ok|um|uh|and|but|oh|well|alright|actually|also|then|ferni|fern|name) )*';
const ASK =
  '(?:(?:if|when|once) you (?:could )?|(?:can|could|would|will) you (?:please )?|please |i need you to |i want you to |go ahead and |you can |just )?';
const VERB = '(?:call|ring|phone|text|message|dial|reach|contact)(?: up)?';
const TAIL = `(?: for me| please| real quick| now| right now)*(?: (?:at|on) ${NUMBER})?(?: for me| please)*`;
const AND_NUMBER = `(?: (?:her|his|their|the) number(?: is|'s) ${NUMBER})?`;
const BARE = new RegExp(`^${LEAD}${ASK}${VERB} ${WHO}${TAIL}${AND_NUMBER}$`);

/** A capitalised word after the first is a name: read it as "name" (the pattern is lower case). */
const words = (text: string): string =>
  text
    .replace(/(\S\s+)(?!I\b)[A-Z][a-z]+\b/g, '$1name')
    .toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * What in Ferni's line keeps the escalation: safety talk, or dying, harm,
 * giving up or hopelessness (his own gloomy lines included). Narrower than
 * hasRiskContent, which also counts everyday words ("tonight", "enough") and
 * stays the test for everything the caller said.
 */
const COMPANION_RISK =
  /\b(?:988|safe|safety|crisis|lifeline|hotline|helpline|emergency|911|di(?:e|es|ed|ing)|dead|death|kill\w*|suicid\w*|self ?harm|hurt\w*|harm\w*|pain|end (?:it|things|my life|your life)|be (?:here|around)|better off|worth (?:it|living)|pointless|hopeless\w*|give up|giving up|nothing matters|no point|alone|lonely|someone (?:to|who can|who could) (?:be|stay) with you)\b/i;

/**
 * Extra words that keep an earlier caller line risky, on top of
 * hasRiskContent and the patterns, which miss "I just want it all to stop",
 * "nothing matters", "it's all too much". Broad on purpose: a false match only
 * means the turn escalates as before.
 */
const EARLIER_RISK =
  /\b(?:stop|over|too much|matters?|no one|nobody|disappear\w*|vanish\w*|done|tired|exhausted|can'?t|cannot|hate (?:myself|my life|everything)|worthless|useless|empty|numb|trapped|burden|alone|lonely|sad|depress\w*|cry\w*|scared|afraid|hopeless\w*|pills?|gun|bridge|jump\w*|rope|cut\w*|bleed\w*|sleep|wake up|forgive|sorry|letter|note|plan\w*|hurt\w*|pain|die|dying|dead|kill\w*|end)\b/i;

const earlierRisky = (text: string): boolean =>
  hasRiskContent(text) || EARLIER_RISK.test(text) || detectCrisis(text).severity > 0;

/** The whole message only asks Ferni to call or text someone (maybe cut off, maybe with their number). */
export function isBareRelayRequest(latest: string): boolean {
  if (typeof latest !== 'string' || !latest.trim()) return false;
  return BARE.test(words(latest));
}

/** The whole message only signs off: "okay, bye", "talk later", "I gotta go, goodbye". */
const SIGN_OFF = new RegExp(
  `^${LEAD}(?:(?:okay|ok|alright|well|thanks|thank you|cool|anyway|right) )*(?:(?:bye|goodbye|bye bye|see you|see ya|talk (?:to you )?(?:later|soon)|gotta go|i gotta go|i have to go|i've got to go|good night|night|later)(?: name| ferni| fern)? ?)+$`
);

export function isBareSignOff(latest: string): boolean {
  if (typeof latest !== 'string' || !latest.trim()) return false;
  return SIGN_OFF.test(words(latest));
}

/**
 * The guidance for this turn when its crisis read becomes a soft check (see
 * the module comment), or null to escalate as before. A bare goodbye is
 * treated the same way, since a goodbye is only a risk sign after risk: with
 * nothing risky said all call, it gets an ordinary goodbye. Anything missing
 * or unreadable escalates.
 */
export function relaySoftGuidance(args: {
  pattern: PatternOutcome;
  verdicts: ReadonlyArray<CrisisVerdict | null>;
  latest: string;
  earlier?: readonly string[];
  companion?: string;
  env?: Env;
}): string | null {
  try {
    const { pattern, verdicts, latest, earlier = [], companion, env = process.env } = args;
    if (!crisisRelaySoftEnabled(env) || pattern !== 'none') return null;
    if (verdicts.length === 0 || verdicts.some((v) => !v || v.risk === 'imminent')) return null;
    if (!verdicts.some((v) => v?.risk === 'crisis')) return null;
    if (endorses(latest)) return null;
    // Ferni had just talked about their safety, a crisis line, or anything dark: never soft.
    if (
      companion &&
      (COMPANION_RISK.test(companion) || /[^\t\n\r\x20-\x7E’‘“”—–…]/.test(companion))
    )
      return null;
    if (earlier.some((text) => text && earlierRisky(text))) return null;
    if (isBareRelayRequest(latest) && !hasRiskContent(latest)) return RELAY_SOFT_CHECK;
    // "bye" is itself on the risk list, so a sign-off is only its own bare words.
    if (isBareSignOff(latest)) return SIGN_OFF_SOFT_CHECK;
    return null;
  } catch {
    return null; // fail closed: an error never softens a turn
  }
}

/** True when relaySoftGuidance would soften the turn. */
export function relaySoftCheck(args: Parameters<typeof relaySoftGuidance>[0]): boolean {
  return relaySoftGuidance(args) !== null;
}

/** The guidance on a softened turn: answer the request; if it was cut off, ask them to finish. */
export const RELAY_SOFT_CHECK = `[SAFETY - SOFT CHECK]
A safety read flagged the caller's last words, but they were only a request to reach someone, and nothing they said this call carried risk.
1. Do not switch to crisis talk or mention hotlines on this alone
2. Answer the request honestly; if it was cut off, ask them warmly and briefly to finish the thought
3. If they then say anything about hurting themselves or not wanting to be here, take it seriously and offer the 988 Suicide & Crisis Lifeline`;

/** The guidance on a softened goodbye: an ordinary goodbye, no hotline on this alone. */
export const SIGN_OFF_SOFT_CHECK = `[SAFETY - SOFT CHECK]
A safety read flagged the caller's goodbye, but nothing they said this call carried risk.
1. Say an ordinary, warm goodbye; do not mention hotlines or crisis lines on this alone
2. If they say anything about hurting themselves or not wanting to be here, take it seriously and offer the 988 Suicide & Crisis Lifeline`;
