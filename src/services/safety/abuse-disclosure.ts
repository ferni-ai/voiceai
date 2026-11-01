/**
 * ABUSE_DISCLOSURE_PATTERNS (off by default): a caller saying someone hurts them is a safety
 * turn, answered as one: are you safe right now, then the line that fits.
 *
 * On main, "my stepdad hits me when he's drunk", "my dad threw me down the stairs" and "my
 * girlfriend threw me against the wall" read nothing on a first turn: the transfer patterns only
 * name he, she, a partner or a spouse, and the suicide classifier reads abuse at random, often as
 * "someone else is at risk" (L8 recall audit, 2026-11-01). With the flag on, a turn whose words
 * say a named person (a parent or step-parent, a parent's partner, a sibling, a relative, a
 * coach or teacher, a partner, or he, she or they) hits, beats, chokes, throws, locks in, starves
 * or hurts the caller, or bruised them, is a crisis-level safety turn, after every other read:
 *
 * - ask whether they are safe right now, and 911 if they are in danger now;
 * - Childhelp for a family member, relative, coach or teacher (a child's line); the National
 *   Domestic Violence Hotline for a partner; either, by age, when only "he" or "she" is named;
 * - the 988 line too unless the whole call is abuse-only: self-harm words this turn or earlier,
 *   the patterns' self-risk, or risk noted earlier on the call keep it.
 *
 * Only adds: a turn already read as a crisis keeps everything it had, and gains the indicators.
 * Anchored so everyday uses ("my dad hits golf balls", "my brother beat me at chess", "the
 * teacher threw me a curveball", "he hurts my feelings") never match.
 *
 * @module AbuseDisclosure
 */

import { flagOn } from '../../config/env-flag.js';
import type { CrisisDetectionResult } from './crisis-guard.js';
import { CRISIS_RESOURCES } from './crisis-response.js';
import { SEVERITY } from './crisis-severity.js';
import { EMERGENCY_NUMBER } from './emergency-number.js';

type Env = Record<string, string | undefined>;
export type AbuseWho = 'child' | 'partner' | 'unknown';

const FAMILY =
  "(?:step ?)?(?:dad|daddy|father|mom|mommy|mum|mother|parents?|brother|sister)|(?:mom|mum|mother|dad|father)'?s (?:boyfriend|girlfriend|husband|wife|partner)|uncle|aunt|cousin|grand(?:pa|ma|father|mother)|coach|teacher|babysitter|foster (?:mom|dad|parents?)";
const PARTNER = 'boyfriend|girlfriend|husband|wife|partner|fianc[eé]e?|ex';
/** Who: "my <family>", "my <partner>", or he, she, they; up to two words before the verb. */
const WHO = `\\b(?:my (?<family>${FAMILY})|my (?<partner>${PARTNER})|(?<pronoun>he|she|they))\\b(?:'ll|'d)?(?: \\w+){0,2}? `;
/** What they do to the caller, each anchored so everyday uses stay out. */
const ACTS = [
  // hits / beats / punches / kicks / slaps / chokes me, not "hits me up", "beat me at chess",
  // "hits me with a dad joke".
  '(?:hits?|hitting|beats?|beating|punch(?:es|ed)?|kicks?|kicked|slaps?|slapped|chokes?|choked|strangled?) me(?! (?:up|at|in|to|on|back|over)\\b| with (?:\\w+ ){0,2}(?:jokes?|questions?|snowballs?|pillows?|balls?|water|puns?|nerf)\\b)(?=\\s*(?:[.,!?;]|$|and|when|if|every|all|again|whenever|because|so|with|until|in front|last|hard|really))',
  // beats me up.
  '(?:beats?|beating|beat) me up\\b',
  // threw me against / into / down / across / on the floor; never "threw me a party" or "in the pool".
  'thr(?:ew|ows?|owing) me (?:against|into|down|across|onto|on the (?:floor|ground)|to the (?:floor|ground)|out of the (?:car|house))',
  // locks me in a room / closet / basement / outside; never "locks me out of the wifi".
  'locks? me (?:in|inside|up)\\b',
  // doesn't / won't / never feed me, at the end of the clause.
  "(?:doesn'?t|does not|won'?t|will not|never|don'?t|do not) (?:let me eat|feed me)(?=\\s*(?:[.,!?;]|$|and|for|anything|at all|when))",
  // hurts me, at the end of the clause or before when / if; never "hurts my feelings".
  '(?:hurts?|hurting|hurt) me(?=\\s*(?:[.,!?;]|$|and|when|if|every|all|again|whenever|because|so|really|bad|a lot))',
  // a threat: says he'll kill / hurt / beat me if ...
  "(?:says?|said|threatens?|threatened)(?: that)? (?:he|she|they)(?:'?ll| will| would|'?d) (?:kill|hurt|beat) me",
];
const DISCLOSURE = new RegExp(`${WHO}(?:${ACTS.join('|')})`, 'i');
/** Bruises a person left: "bruises where my dad grabbed me". */
const BRUISES =
  /\bbruises? (?:where|from where|from when|from|after) (?:\w+'?s? ){0,4}?(?:grabbed|hit|kicked|punched|squeezed|choked|threw) me\b/i;
const FAMILY_WORD = new RegExp(`\\bmy (?:${FAMILY})\\b`, 'i');
const PARTNER_WORD = new RegExp(`\\bmy (?:${PARTNER})\\b`, 'i');

/** Scared to go home, at the end of the clause or before tonight / because / a person. */
const SCARED_HOME =
  /\b(?:i'?m|i am|i'?ve been) (?:so |really |too )?(?:scared|afraid|terrified) (?:to go|of going) home(?=\s*(?:[.,!?;]|$|tonight|because|cause|he|she|they|'cause))/i;
/** The caller's own words about hurting themselves or not wanting to live. */
const SELF_HARM =
  /\b(?:(?:kill|hurt|cut|harm|burn) my ?self|suicid\w*|want to die|wanna die|don'?t want to (?:live|be here|be alive)|can'?t go on|end it all|better off dead|unalive|overdose)\b/i;

/** What a disclosure in these words names, or null. */
export function abuseDisclosure(text: string): { who: AbuseWho; selfHarm: boolean } | null {
  const said = text.normalize('NFKC').replace(/[’‘]/g, "'");
  const match = DISCLOSURE.exec(said) ?? BRUISES.exec(said);
  const scared = !match && SCARED_HOME.test(said);
  if (!match && !scared) return null;
  const g = match?.groups ?? {};
  const family = g.family ?? (g.partner ? undefined : FAMILY_WORD.exec(said)?.[0]);
  const partner = g.partner ?? (family ? undefined : PARTNER_WORD.exec(said)?.[0]);
  const who: AbuseWho = family ? 'child' : partner ? 'partner' : 'unknown';
  return { who, selfHarm: SELF_HARM.test(said) };
}

const INDICATOR = 'abuse_disclosure';

/** The settled turn with the flag on: an abuse disclosure is a crisis-level safety turn. */
export function withAbuseDisclosure<T extends { crisis: CrisisDetectionResult; soft: boolean }>(
  settled: T,
  turn: { latest: string; earlier?: readonly string[] },
  priorRisk: boolean,
  env: Env = process.env
): T {
  if (!flagOn('ABUSE_DISCLOSURE_PATTERNS', env)) return settled;
  const found = abuseDisclosure(turn.latest);
  if (!found) return settled;
  const { crisis } = settled;
  // 988 stays unless the whole call is abuse-only: self-harm words in any turn, the patterns'
  // self-risk this turn (not the classifier's or the voice's), or risk noted earlier on the call.
  const selfRisk =
    priorRisk ||
    (turn.earlier ?? []).some((line) => SELF_HARM.test(line)) ||
    (crisis.isCrisis && crisis.indicators.some((i) => !/^(classifier|voice|who)/.test(i)));
  const indicators = [
    ...crisis.indicators,
    INDICATOR,
    `${INDICATOR}_${found.who}`,
    ...(found.selfHarm || selfRisk ? [`${INDICATOR}_self_harm`] : []),
  ];
  return {
    ...settled,
    soft: false,
    crisis: {
      ...crisis,
      isCrisis: true,
      severity: Math.max(crisis.severity, SEVERITY.crisis),
      indicators,
      subject: 'self',
    },
  };
}

const CHILDHELP = CRISIS_RESOURCES.child_abuse[0];
const DV_HOTLINE = CRISIS_RESOURCES.domestic_abuse[0];
const LINES: Record<AbuseWho, string> = {
  child: `Offer the ${CHILDHELP.name}: call or text ${CHILDHELP.phone}, any time. If they are a child or teen, gently encourage them to tell a safe adult they trust`,
  partner: `Offer the ${DV_HOTLINE.name}: call ${DV_HOTLINE.phone} or ${DV_HOTLINE.text?.toLowerCase() ?? 'text'}, any time`,
  unknown: `If they are a child or teen, offer the ${CHILDHELP.name} (call or text ${CHILDHELP.phone}); otherwise the ${DV_HOTLINE.name} (${DV_HOTLINE.phone})`,
};

/** The crisis guidance for an abuse disclosure (turn-handler.ts), or null for any other turn. */
export function abuseGuidance(crisis: { indicators: readonly string[] }): string | null {
  if (!crisis.indicators.includes(INDICATOR)) return null;
  const who: AbuseWho = crisis.indicators.includes(`${INDICATOR}_child`)
    ? 'child'
    : crisis.indicators.includes(`${INDICATOR}_partner`)
      ? 'partner'
      : 'unknown';
  const lines = [
    '1. Believe them and thank them for telling you. Say plainly that it is not their fault',
    '2. Ask whether they are safe right now',
    `3. If they are in danger right now, tell them to call ${EMERGENCY_NUMBER}`,
    `4. ${LINES[who]}`,
    '5. Do not ask for details of what happened, and do not tell them what they must do',
  ];
  if (crisis.indicators.includes(`${INDICATOR}_self_harm`)) {
    lines.push(
      '6. They also said something about hurting themselves: include the 988 Suicide & Crisis Lifeline (call or text 988)'
    );
  }
  return `[CRITICAL - USER SAFETY]
The caller is telling you that someone is hurting them. Your response MUST:
${lines.join('\n')}`;
}
