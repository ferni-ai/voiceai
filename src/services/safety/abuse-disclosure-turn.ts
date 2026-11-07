/**
 * ABUSE_DISCLOSURE_PATTERNS (off by default): the safety turn for an abuse disclosure that
 * abuse-disclosure.ts reads, after every other read of the turn (startTurnCrisis), and its
 * guidance (turn-handler.ts). Only adds: a turn already read as a crisis keeps everything.
 *
 * @module AbuseDisclosureTurn
 */

import { flagOn } from '../../config/env-flag.js';
import type { CrisisVerdict } from './crisis-classifier.js';
import type { CrisisDetectionResult } from './crisis-guard.js';
import { CRISIS_RESOURCES } from './crisis-response.js';
import { SEVERITY } from './crisis-severity.js';
import { EMERGENCY_NUMBER } from './emergency-number.js';

import {
  ABUSE_INDICATOR as INDICATOR,
  abuseDisclosure,
  type AbuseWho,
  selfHarmWords,
} from './abuse-disclosure.js';
import { selfRiskThisCall } from './crisis-call-risk.js';
import { minorAbuseGuidance } from './minor-abuse-disclosure.js';

type Env = Record<string, string | undefined>;

/** What the call already shows besides this turn's disclosure (startTurnCrisis). */
export interface AbuseCallRisk {
  /** Risk noted on this call before this turn's own reads (crisis-call-risk.ts). */
  riskBefore: boolean;
  /** This turn's own patterns read risk, before any other read (startTurnCrisis's pattern). */
  patternRisk: boolean;
  /** The classifier read this turn as about the caller, or gave no read. */
  classifierSelf: boolean;
}

/**
 * What the call shows before this turn's own note (startTurnCrisis calls this first): risk noted
 * earlier on the call, or no call to look at; and whether this turn's own patterns read risk.
 */
export function abuseCallRisk(
  sessionId: string | undefined,
  latest: string,
  patternRisk: boolean
): Omit<AbuseCallRisk, 'classifierSelf'> {
  return { riskBefore: !sessionId || selfRiskThisCall(sessionId, latest), patternRisk };
}

/**
 * Whether the classifier read this turn as risk to the caller. No classifier, no answer or an
 * error count as yes: 988 is only dropped when the classifier said this turn is not about that.
 */
export async function classifierReadSelf(
  run: { verdict: Promise<CrisisVerdict | null> } | null
): Promise<boolean> {
  if (!run) return true;
  const verdict = await run.verdict.catch(() => null);
  return verdict === null || (verdict.risk !== 'none' && verdict.subject === 'self');
}

/**
 * 988 stays unless the whole call is abuse-only (Seth's call (b), 2026-11-01): self-harm words
 * in this turn or an earlier one, the patterns' own risk this turn, the classifier reading the
 * turn as about the caller, or risk noted earlier on the call each keep it.
 */
function selfRiskOnCall(
  turn: { latest: string; earlier?: readonly string[] },
  call: AbuseCallRisk,
  thisTurnWords: boolean
): boolean {
  const before = (turn.earlier ?? []).filter((line) => line !== turn.latest);
  return (
    call.riskBefore ||
    call.patternRisk ||
    call.classifierSelf ||
    thisTurnWords ||
    before.some(selfHarmWords)
  );
}

/** The settled turn with the flag on: an abuse disclosure is a crisis-level safety turn. */
export function withAbuseDisclosure<T extends { crisis: CrisisDetectionResult; soft: boolean }>(
  settled: T,
  turn: { latest: string; earlier?: readonly string[] },
  call: AbuseCallRisk,
  env: Env = process.env
): T {
  if (!flagOn('ABUSE_DISCLOSURE_PATTERNS', env)) return settled;
  const found = abuseDisclosure(turn.latest);
  if (!found) return settled;
  const { crisis } = settled;
  // The kernel's own abuse read (crisis-guard.ts) keeps 988; this read knows the call and decides.
  const indicators = [
    ...crisis.indicators.filter((i) => !i.startsWith(INDICATOR)),
    INDICATOR,
    `${INDICATOR}_${found.who}`,
    ...(selfRiskOnCall(turn, call, found.selfHarm) ? [`${INDICATOR}_self_harm`] : []),
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

/** startTurnCrisis's settled read, then the abuse disclosure once the classifier has answered. */
export function withAbuseRead<T extends { crisis: CrisisDetectionResult; soft: boolean }>(
  read: Promise<T>,
  turn: { latest: string; earlier?: readonly string[] },
  call: Omit<AbuseCallRisk, 'classifierSelf'>,
  classifier: { verdict: Promise<CrisisVerdict | null> } | null,
  env: Env = process.env
): Promise<T> {
  return read.then(async (settled) => {
    const classifierSelf = await classifierReadSelf(classifier);
    return withAbuseDisclosure(settled, turn, { ...call, classifierSelf }, env);
  });
}

const CHILDHELP = CRISIS_RESOURCES.child_abuse[0];
const DV_HOTLINE = CRISIS_RESOURCES.domestic_abuse[0];
// A safe person beside the line: a trusted adult for a child or teen, and for an adult someone
// they trust to be with, never "a trusted adult".
const SAFE_ADULT = 'gently encourage them to tell a safe adult they trust';
const SAFE_PERSON = 'gently ask whether there is someone they trust they could be with tonight';
const LINES: Record<AbuseWho, string> = {
  child: `Offer the ${CHILDHELP.name}: call or text ${CHILDHELP.phone}, any time. If they are a child or teen, ${SAFE_ADULT}`,
  partner: `Offer the ${DV_HOTLINE.name}: call ${DV_HOTLINE.phone} or ${DV_HOTLINE.text?.toLowerCase() ?? 'text'}, any time, and ${SAFE_PERSON}`,
  unknown: `If they are a child or teen, offer the ${CHILDHELP.name} (call or text ${CHILDHELP.phone}) and ${SAFE_ADULT}; otherwise offer the ${DV_HOTLINE.name} (${DV_HOTLINE.phone}) and ${SAFE_PERSON}`,
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
    '5. Do not ask for details of what happened, and do not tell them what they must do. Never promise to keep it secret or between you, and never say or imply that you will tell anyone',
  ];
  if (crisis.indicators.includes(`${INDICATOR}_self_harm`)) {
    lines.push(
      '6. They may also be at risk of hurting themselves: include the 988 Suicide & Crisis Lifeline (call or text 988)'
    );
  }
  return `[CRITICAL - USER SAFETY]
The caller is telling you that someone is hurting them. Your response MUST:
${lines.join('\n')}`;
}

/**
 * The voice turn's guidance for a disclosure (turn-handler.ts), or null: a minor's
 * (MINOR_ABUSE_DISCLOSURE, main's) first, then this module's. Each is null unless its flag read
 * the turn, so a turn both read keeps the minor's child-safety care, as with this flag off.
 */
export function disclosureGuidance(crisis: CrisisDetectionResult): string | null {
  return minorAbuseGuidance(crisis) ?? abuseGuidance(crisis);
}
