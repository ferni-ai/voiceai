/**
 * MINOR_ABUSE_DISCLOSURE (off by default): a caller who sounds under 18 and says someone touches
 * them, makes them do sexual things or sends for pictures of them is a safety turn, answered with
 * child-safety care.
 *
 * On main, "a teacher at my school touched me, I'm 14" read nothing (0/10), "I'm 15 and an older
 * guy online makes me send him pictures" 1/10 on a first turn, and "I'm 16 and my dad's friend
 * raped me" 1/10 mid-call: the patterns have no words for it, and the classifier reads it at
 * random, often as "someone else is at risk", which brings 988 guidance (L8 recall audit,
 * 2026-11-01). The owner's call (a), 11-01: child-safety care, a safe-adult nudge, Childhelp,
 * and the call's memory held.
 *
 * With the flag on, when MINOR_CARE's signals say the caller sounds under 18 (an age or grade this
 * turn or earlier, or the call already marked) and this turn's words describe touching, sexual
 * acts, coercion or sexual pictures, the turn is a crisis-level safety turn after every other
 * read, never the scripted takeover, and the call's memory is held. The voice turn's guidance
 * (turn-handler.ts): not their fault, are you safe right now, 911 if in danger now, a safe adult,
 * Childhelp (call or text), no details. When the caller may be at risk too, the turn gets main's
 * crisis guidance, 988 and all, with the child-safety care after it: self-harm words in any turn
 * (passive and means ideation included), risk noted earlier on the call, this turn's own read
 * of risk before the disclosure, whoever made it (the patterns, the classifier, a soft check), or
 * no classifier read at all (off, an error or a timeout: the risk can't be read, so 988 stays).
 * Main answers every one of those reads with guidance that names 988, so 988 is never taken away.
 *
 * Physical harm too (owner decision 2026-11-02): hitting, kicking, choking, locking in and the
 * other acts abuse-disclosure.ts reads, plus burning. With ABUSE_DISCLOSURE_PATTERNS on, a line
 * its read already answers stays with that read, as on main. Only sexual harm holds memory. A
 * scripted turn (an imminent one) says the script first and whole, then the child-safety lines
 * (childSafetyScript), on the voice turn and in the gate (crisis-gate.ts).
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
import type { CrisisVerdict } from './crisis-classifier.js';
import type { CrisisDetectionResult } from './crisis-guard.js';
import { buildCrisisGuidance } from './crisis-guard.js';
import { spanishScript } from '../../utils/minor-crisis-care.js';
import {
  ABUSE_INDICATOR,
  abuseDisclosure,
  abuseOnlyRead,
  MINOR_ABUSE_INDICATOR as INDICATOR,
  physicalHarm,
} from './abuse-disclosure.js';
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
/** A clause end after "the point of anything", "the point of living", ... */
const CLAUSE = String.raw`(?=\s*(?:[.,!?;]|$|and\b|any ?more|at all))`;
/** Not a time of day or a plan: "wake up early", "wake up for school", "not wake up until noon". */
const NOT_A_TIME = String.raw`(?!\s+(?:early|late|so early|at|for|before|until|till|in time)\b)`;
/** The caller hurting themselves, said outright, passively or as a way to do it. */
const SELF_HARM = new RegExp(
  [
    String.raw`\b(?:(?:kill|hurt|cut|harm|burn) my ?self|suicid\w*|(?:want to|wanna) die(?!\s+(?:my|his|her|their|the|your|it)\b)|don'?t want to (?:live|be here|be alive)|end it all|better off dead|unalive)\b`,
    // Hopeless: "I feel so hopeless"; never "hopeless at math", "a hopeless romantic".
    String.raw`\bhopeless\b(?!\s+(?:at|with|romantic|case)\b)`,
    // Passive: "don't want to wake up tomorrow", "hope I never wake up", "sleep and never wake up".
    String.raw`\b(?:(?:don'?t|do not|never) want to|hope i (?:don'?t|never)) wake up${NOT_A_TIME}`,
    String.raw`\b(?:sleep|asleep) and (?:never|not) wake up${NOT_A_TIME}`,
    // No point: "don't see the point of anything anymore", "there's no point in living".
    String.raw`\b(?:(?:don'?t|do not|can'?t|cannot) see (?:the|any)|there'?s no|there is no) point (?:of|in|to) (?:anything|living|life|being alive|being here|going on)${CLAUSE}`,
    // Means: "thinking about taking all of my mom's pills", "want to swallow the whole bottle of meds".
    String.raw`\b(?:think\w* (?:about|of)|want(?:s|ed)? to|wanna|going to|gonna|plan\w* (?:on|to)|wish i could) (?:just )?(?:tak\w*|swallow\w*) (?:all|the whole bottle|a bunch|a handful)(?: of)? (?:[\w']+ ){0,3}(?:pills|meds|medicine|medication|tablets)\b(?![^.!?]*\b(?:doctor|prescribed|pharmacy|drop-?off|on time|with (?:breakfast|lunch|dinner|food))\b)`,
  ].join('|'),
  'i'
);
const plain = (line: string): string => line.normalize('NFKC').replace(/[’‘]/g, "'");

export interface MinorAbuseTurn {
  latest: string;
  earlier?: readonly string[];
  /** Ferni's last line, for "how old are you?" answered with a bare number. */
  companion?: string;
}

export type MinorHarm = 'sexual' | 'physical';

/** The harm these words, from a caller who sounds under 18, say was done to them, or null. */
export function minorHarm(call: string | undefined, turn: MinorAbuseTurn): MinorHarm | null {
  const said = plain(turn.latest);
  const harm = HARM.test(said) ? 'sexual' : physicalHarm(said) ? 'physical' : null;
  if (!harm) return null;
  const words = [said, ...(turn.earlier ?? [])];
  const minor =
    likelyMinor(call) || ageSignal(call) || words.some((w) => statesUnder18(w, turn.companion));
  return minor ? harm : null;
}

const SELF_RISK = `${INDICATOR}_self_harm`;

/** The turn as the crisis reads settled it, before this module. */
interface SettledRead {
  crisis: CrisisDetectionResult;
  soft: boolean;
}

/**
 * Whether the caller may be at risk themselves, so the disclosure turn keeps 988: risk noted
 * earlier on the call, self-harm words in any turn, this turn's own read of risk, whoever made
 * it (the patterns, the classifier's crisis or imminent read, the who read, a soft check), or no
 * classifier read at all (the owner's ruling, 11-02: if the risk can't be read, the lifeline
 * stays). Main answers each of those reads with guidance or a check-in that names 988.
 */
export function callerMayBeAtRisk(
  settled: SettledRead,
  turn: MinorAbuseTurn,
  priorRisk: boolean,
  classifierNoRead = false
): boolean {
  // The kernel's abuse read alone is no risk to the caller's own life (abuseOnlyRead).
  const read = settled.crisis.isCrisis && !abuseOnlyRead(settled.crisis);
  if (priorRisk || classifierNoRead || settled.soft || read) return true;
  return [turn.latest, ...(turn.earlier ?? [])].some((line) => SELF_HARM.test(plain(line)));
}

/** What the call shows besides this turn's words (startTurnCrisis). */
export interface MinorCallRisk {
  /** Risk noted on the call before this turn's own read (crisis-lone-imminent.ts). */
  priorRisk: boolean;
  /** The classifier gave no read of this turn: off, an error or no answer in time. */
  classifierNoRead?: boolean;
}

/** The settled turn with the flag on: a minor's abuse disclosure is a crisis-level safety turn. */
export function withMinorAbuseDisclosure<T extends SettledRead>(
  settled: T,
  call: string | undefined,
  turn: MinorAbuseTurn,
  { priorRisk, classifierNoRead = false }: MinorCallRisk,
  env: Env = process.env
): T {
  const harm = flagOn('MINOR_ABUSE_DISCLOSURE', env) ? minorHarm(call, turn) : null;
  if (!harm) return settled;
  const scripted = withChildSafetyScript(settled);
  // Physical harm the abuse read answers (ABUSE_DISCLOSURE_PATTERNS): its turn and guidance.
  const abuseRead = flagOn('ABUSE_DISCLOSURE_PATTERNS', env) && !!abuseDisclosure(turn.latest);
  if (harm === 'physical' && abuseRead) return scripted;
  if (harm === 'sexual') holdForSexualTopic(call);
  const { crisis } = scripted;
  const selfHarm = callerMayBeAtRisk(settled, turn, priorRisk, classifierNoRead);
  log.info(
    { harm, wasCrisis: crisis.isCrisis, selfHarm, classifierNoRead },
    'MINOR_ABUSE_DISCLOSURE'
  );
  return {
    ...scripted,
    soft: false,
    crisis: {
      ...crisis,
      isCrisis: true,
      severity: Math.max(crisis.severity, SEVERITY.crisis),
      // This read decides for the minor: the kernel's abuse read gives way, as the abuse read's
      // own turn read does (withAbuseDisclosure).
      indicators: [
        ...crisis.indicators.filter((i) => !i.startsWith(ABUSE_INDICATOR)),
        INDICATOR,
        ...(selfHarm ? [SELF_RISK] : []),
      ],
      subject: 'self',
    },
  };
}

/** Whether the classifier gave no read of the turn: off (no run), an error or no answer in time. */
async function classifierGaveNoRead(
  run: { verdict: Promise<CrisisVerdict | null> } | null
): Promise<boolean> {
  if (!run) return true;
  return (await run.verdict.catch(() => null)) === null;
}

/** startTurnCrisis's settled read, then a minor's disclosure once the classifier answered or not. */
export async function withMinorAbuseRead<T extends SettledRead>(
  read: Promise<T>,
  call: string | undefined,
  turn: MinorAbuseTurn,
  risk: { priorRisk: boolean; classifier: { verdict: Promise<CrisisVerdict | null> } | null },
  env: Env = process.env
): Promise<T> {
  const settled = await read;
  const classifierNoRead = await classifierGaveNoRead(risk.classifier);
  const { priorRisk } = risk;
  return withMinorAbuseDisclosure(settled, call, turn, { priorRisk, classifierNoRead }, env);
}

const CHILDHELP = CRISIS_RESOURCES.child_abuse[0];

/**
 * The voice turn's crisis guidance for a minor's abuse disclosure, or null for any other turn.
 * When the caller may be at risk too, main's crisis guidance (988 and all) comes first and the
 * child-safety care follows it: the stronger guidance, never one without 988.
 */
export function minorAbuseGuidance(crisis: CrisisDetectionResult): string | null {
  if (!crisis.indicators.includes(INDICATOR)) return null;
  // The abuse read's own self-harm read (abuse-disclosure-turn.ts) keeps 988 here too.
  const selfRisk = [SELF_RISK, 'abuse_disclosure_self_harm'].some((i) =>
    crisis.indicators.includes(i)
  );
  const thank =
    '1. Thank them for telling you. Say plainly that it is not their fault and they are not in trouble';
  // 988 in the first sentence, so a long reply that runs out never loses it.
  const lines = [
    selfRisk
      ? `${thank}. They may be at risk themselves too: in that same first sentence, say they can call or text 988, the Suicide & Crisis Lifeline, any time`
      : thank,
    `2. Ask whether they are safe right now. If they are in danger right now, they can call ${EMERGENCY_NUMBER}`,
    '3. Gently encourage them to tell a safe adult they trust, like a parent who is not involved, a teacher or a school counselor',
    `4. Offer the ${CHILDHELP.name}: call or text ${CHILDHELP.phone}, any time`,
    '5. Do not ask for details of what happened. Never promise to keep it secret or between you, and never say or imply that you will tell anyone',
  ];
  const childSafety = `[CRITICAL - CHILD SAFETY]
The caller sounds under 18 and is telling you that someone is touching or hurting them. Your response MUST:
${lines.join('\n')}`;
  return selfRisk ? `${buildCrisisGuidance(crisis)}\n\n${childSafety}` : childSafety;
}

/** What a scripted turn says after its script, to a caller under 18 who told of harm. */
export const CHILD_SAFETY_SCRIPT_LINES = `What you told me is not your fault, and you're not in trouble. When you can, tell a safe adult you trust, like a teacher or a school counselor. You can also call or text the ${CHILDHELP.name} at ${CHILDHELP.phone}, any time.`;

/** The crisis script, whole and first, then the child-safety lines; a Spanish script as it is. */
export function childSafetyScript(script: string): string {
  if (spanishScript(script) || script.endsWith(CHILD_SAFETY_SCRIPT_LINES)) return script;
  return `${script}\n\n${CHILD_SAFETY_SCRIPT_LINES}`;
}

/** A scripted turn's crisis read with the child-safety lines after its script. */
function withChildSafetyScript<T extends SettledRead>(settled: T): T {
  const script = settled.crisis.suggestedResponse;
  if (!script) return settled;
  return {
    ...settled,
    crisis: { ...settled.crisis, suggestedResponse: childSafetyScript(script) },
  };
}

/**
 * The gate's crisis script (crisis-gate.ts) with the flag on, for a caller who sounds under 18
 * and told of harm this turn: the script, then the child-safety lines. Never throws: on any
 * failure the script goes as it is.
 */
export function minorHarmScript(
  script: string,
  call: string | undefined,
  turn: MinorAbuseTurn,
  env: Env = process.env
): string {
  try {
    if (!flagOn('MINOR_ABUSE_DISCLOSURE', env) || !minorHarm(call, turn)) return script;
    return childSafetyScript(script);
  } catch (error) {
    log.warn({ error: String(error) }, 'MINOR_ABUSE_DISCLOSURE script lines failed');
    return script;
  }
}
