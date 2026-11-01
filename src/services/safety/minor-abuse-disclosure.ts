/**
 * MINOR_ABUSE_DISCLOSURE (off by default): a caller who sounds under 18 and says someone touches
 * them, makes them do sexual things or sends for pictures of them is a safety turn, answered with
 * child-safety care.
 *
 * On main, "a teacher at my school touched me, I'm 14" read nothing (0/10), "I'm 15 and an older
 * guy online makes me send him pictures" 1/10 on a first turn, and "I'm 16 and my dad's friend
 * raped me" 1/10 mid-call: the patterns have no words for it, and the classifier reads it at
 * random, often as "someone else is at risk", which brings 988 guidance (L8 recall audit,
 * 2026-11-01). Seth's call (a), 11-01: child-safety care, a safe-adult nudge, Childhelp, and the
 * call's memory held.
 *
 * With the flag on, when MINOR_CARE's signals say the caller sounds under 18 (an age or grade this
 * turn or earlier, or the call already marked) and this turn's words describe touching, sexual
 * acts, coercion or sexual pictures, the turn is a crisis-level safety turn after every other
 * read, never the scripted takeover, and the call's memory is held. The voice turn's guidance
 * (turn-handler.ts): not their fault, are you safe right now, 911 if in danger now, a safe adult,
 * Childhelp (call or text), no details; 988 too unless the whole call is abuse-only (self-harm
 * words in any turn, the patterns' self-risk, or risk noted earlier on the call keep it).
 *
 * Only adds: a turn already read as a crisis keeps everything it had, and gains the indicators.
 * Anchored so a child's everyday words ("touch up my essay", "touch base", "makes me do my
 * homework", "does things to annoy me", "sends me pictures of her dog") never match.
 *
 * @module MinorAbuseDisclosure
 */

import { flagOn } from '../../config/env-flag.js';
import { ageSignal, likelyMinor, statesUnder18 } from '../../utils/minor-care.js';
import { createLogger } from '../../utils/safe-logger.js';
import { holdForSexualTopic } from '../../utils/sexual-topic-hold.js';
import type { CrisisDetectionResult } from './crisis-guard.js';
import { CRISIS_RESOURCES } from './crisis-response.js';
import { SEVERITY } from './crisis-severity.js';
import { EMERGENCY_NUMBER } from './emergency-number.js';

type Env = Record<string, string | undefined>;
const log = createLogger({ module: 'MinorAbuseDisclosure' });

/** The end of what was done to them: a clause end, "and", "when", "at night", "again", ... */
const END = String.raw`(?=\s*(?:[.,!?;]|$|and\b|when|whenever|at night|again|every|all the time|in (?:my|his|her|the)|there|down there|if|so\b|and i))`;
/** What someone did to them, each anchored so a child's everyday words stay out. */
const HARM = new RegExp(
  [
    // touches me, touched me; never "touch up", "touch base", "touched on", "touched my phone".
    String.raw`\btouch(?:es|ed|ing)? me${END}`,
    String.raw`\btouch(?:es|ed|ing)? (?:me |my )?(?:private|privates|private parts|down there)\b`,
    // makes me do stuff I don't want to, makes me do sexual things; never "makes me do my homework".
    String.raw`\b(?:makes?|made|making|forces?|forced) me do (?:stuff|things|sexual (?:stuff|things))(?: (?:that )?i (?:don'?t|didn'?t|do not|did not) (?:want|like))?(?=\s*(?:[.,!?;]|$|to\b|and|when|with|at night))`,
    String.raw`\b(?:makes?|made|forces?|forced) me do (?:sexual|sex)\b`,
    // does things to me; never "does things to annoy me".
    String.raw`\b(?:does|did|do|doing) (?:stuff|things|bad things|weird things|sexual things) to me\b`,
    // raped / molested / sexually abused me.
    String.raw`\b(?:rap(?:ed|es|ing)|molest(?:ed|s|ing)?|sexually (?:abus|assault|touch)\w*) me\b`,
    String.raw`\bi (?:was|got|have been|'ve been) (?:raped|molested|sexually (?:abused|assaulted))\b`,
    // makes me send him pictures; never "she sends me pictures of her dog".
    String.raw`\b(?:makes?|made|asks?|asked|wants?|wanted|tells?|told|forces?|forced) me (?:to )?send (?:him|her|them) (?:pictures|pics|photos|nudes|naked)`,
    String.raw`\b(?:asks?|asked|wants?|wanted) (?:me )?(?:for )?(?:nudes|naked (?:pictures|pics|photos))\b`,
  ].join('|'),
  'i'
);
const SELF_HARM =
  /\b(?:(?:kill|hurt|cut|harm|burn) my ?self|suicid\w*|want to die|wanna die|don'?t want to (?:live|be here|be alive)|end it all|better off dead|unalive)\b/i;

export interface MinorAbuseTurn {
  latest: string;
  earlier?: readonly string[];
  /** Ferni's last line, for "how old are you?" answered with a bare number. */
  companion?: string;
}

/** Whether these words, from a caller who sounds under 18, describe sexual harm to them. */
export function minorAbuseDisclosure(call: string | undefined, turn: MinorAbuseTurn): boolean {
  const said = turn.latest.normalize('NFKC').replace(/[’‘]/g, "'");
  if (!HARM.test(said)) return false;
  const words = [said, ...(turn.earlier ?? [])];
  return (
    likelyMinor(call) || ageSignal(call) || words.some((w) => statesUnder18(w, turn.companion))
  );
}

const INDICATOR = 'minor_abuse_disclosure';

/** The settled turn with the flag on: a minor's abuse disclosure is a crisis-level safety turn. */
export function withMinorAbuseDisclosure<
  T extends { crisis: CrisisDetectionResult; soft: boolean },
>(
  settled: T,
  call: string | undefined,
  turn: MinorAbuseTurn,
  priorRisk: boolean,
  env: Env = process.env
): T {
  if (!flagOn('MINOR_ABUSE_DISCLOSURE', env) || !minorAbuseDisclosure(call, turn)) return settled;
  holdForSexualTopic(call);
  const { crisis } = settled;
  // 988 stays unless the whole call is abuse-only: self-harm words in any turn, the patterns'
  // self-risk this turn (not the classifier's or the voice's), or risk noted earlier on the call.
  const selfHarm =
    priorRisk ||
    [turn.latest, ...(turn.earlier ?? [])].some((line) => SELF_HARM.test(line)) ||
    (crisis.isCrisis && crisis.indicators.some((i) => !/^(classifier|voice|who)/.test(i)));
  log.info({ wasCrisis: crisis.isCrisis, selfHarm }, 'MINOR_ABUSE_DISCLOSURE');
  return {
    ...settled,
    soft: false,
    crisis: {
      ...crisis,
      isCrisis: true,
      severity: Math.max(crisis.severity, SEVERITY.crisis),
      indicators: [
        ...crisis.indicators,
        INDICATOR,
        ...(selfHarm ? [`${INDICATOR}_self_harm`] : []),
      ],
      subject: 'self',
    },
  };
}

const CHILDHELP = CRISIS_RESOURCES.child_abuse[0];

/** The voice turn's crisis guidance for a minor's abuse disclosure, or null for any other turn. */
export function minorAbuseGuidance(crisis: { indicators: readonly string[] }): string | null {
  if (!crisis.indicators.includes(INDICATOR)) return null;
  const lines = [
    '1. Thank them for telling you. Say plainly that it is not their fault and they are not in trouble',
    `2. Ask whether they are safe right now. If they are in danger right now, they can call ${EMERGENCY_NUMBER}`,
    '3. Gently encourage them to tell a safe adult they trust, like a parent who is not involved, a teacher or a school counselor',
    `4. Offer the ${CHILDHELP.name}: call or text ${CHILDHELP.phone}, any time`,
    '5. Do not ask for details of what happened, and do not promise to keep it a secret',
  ];
  if (crisis.indicators.includes(`${INDICATOR}_self_harm`)) {
    lines.push(
      '6. They also said something about hurting themselves: include the 988 Suicide & Crisis Lifeline (call or text 988)'
    );
  }
  return `[CRITICAL - CHILD SAFETY]
The caller sounds under 18 and is telling you that someone is touching or hurting them. Your response MUST:
${lines.join('\n')}`;
}
