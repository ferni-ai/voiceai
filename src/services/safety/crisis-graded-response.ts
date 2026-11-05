/**
 * CRISIS_GRADED_RESPONSE: F3's graded crisis response, its rows. The flag, the shadow log
 * and the seams are crisis-graded-shadow.ts.
 *
 * Dev, 2026-11: about 10 of 120 non-crisis eval calls got a crisis-line reply, nearly all
 * from one classifier read of crisis on a turn the patterns read as nothing. That one read
 * gets the same crisis guidance as a pattern hit. F3 adds a middle rung for such a turn,
 * L2: a warm check-in in Ferni's own voice that names 988 once, with no crisis-mode takeover.
 *
 * gradeTurn says whether a turn would get L2 and, when not, every row that blocks it. It
 * decides nothing: in PR-1 its answer is only logged.
 *
 * L2 needs every row clear: main's full crisis guide; no imminent read; about the caller;
 * no pattern signal at all; no sign of a caller under 18 (owner exemption ignored); no
 * abuse disclosure; at least two reads of the turn, none missing, exactly one crisis and no
 * two agreeing on risk; no risk on the call before this turn; Ferni's line did not ask
 * about safety; no grounded-release screen open; and the read is crisis about the caller.
 *
 * @module CrisisGradedResponse
 */

import { ageSignal, derivedHold, statesUnder18 } from '../../utils/minor-care.js';
import { stripSSML } from '../../utils/text-utils.js';
import { abuseDisclosure } from './abuse-disclosure.js';
import type { CrisisVerdict } from './crisis-classifier.js';
import type { CrisisDetectionResult } from './crisis-guard.js';
import { SAFETY_TALK } from './crisis-lone-imminent.js';

/** What main gives the turn: the gate's decision, or the pipeline's settled turn. */
export type MainLevel = 'pass' | 'guide' | 'guide_third_party' | 'replace' | 'soft';

export interface GradeInput {
  source: 'gate' | 'pipeline';
  main: MainLevel;
  /** The patterns' read, before the classifier's verdict. */
  detection: CrisisDetectionResult;
  verdict: CrisisVerdict | null;
  /** Every read of the turn (turnVerdicts); undefined when the turn's reads were not gathered. */
  reads: ReadonlyArray<CrisisVerdict | null> | undefined;
  /** Risk on the call before this turn's read (callRiskBeforeTurn). */
  priorRisk: boolean;
  screen: 'none' | 'reask' | 'positive';
  latest: string;
  earlier: readonly string[];
  companion?: string;
  call: string | undefined;
}

export type BlockReason =
  | 'not_guide'
  | 'R1_imminent'
  | 'R2_third_party'
  | 'R4_pattern'
  | 'R5_minor'
  | 'R5_abuse'
  | 'R6_reads_missing'
  | 'R6_read_null'
  | 'R6_single_read'
  | 'R6_agreeing_reads'
  | 'R6_no_risk_read'
  | 'R7_prior_risk'
  | 'R7_safety_question'
  | 'R7_screen'
  | 'R8_not_crisis_self';

export type Grade =
  { would: 'L2' } | { would: null; blockedBy: BlockReason; failed: BlockReason[] };

/** NFKC, lower case, every apostrophe variant as ', spaces collapsed (crisis-lone-imminent.ts). */
const normalized = (text: string): string =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‛′´`ʼʹ＇]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

/** "Is anyone nearby who can be with you?": the imminent script's closing question. */
const ASKS_WHO_IS_NEAR =
  /\b(?:any|some)(?:one|body)\b[^.?!]*\b(?:nearby|near you|close by|with you|there with you)\b[^.?!]*\?\s*$/;

/** Ferni's line asked about the caller's safety: an answer to it is never a non-answer. */
export function endsInSafetyQuestion(companion: string | undefined): boolean {
  const said = normalized(stripSSML(companion ?? ''));
  return SAFETY_TALK.test(said) || ASKS_WHO_IS_NEAR.test(said);
}

const isRisk = (v: CrisisVerdict | null): boolean => v?.risk === 'crisis' || v?.risk === 'imminent';

function readsFailing(reads: GradeInput['reads']): BlockReason[] {
  if (reads === undefined) return ['R6_reads_missing'];
  const out: BlockReason[] = [];
  if (reads.some((v) => v === null)) out.push('R6_read_null');
  if (reads.length < 2) out.push('R6_single_read');
  if (reads.filter(isRisk).length >= 2) out.push('R6_agreeing_reads');
  if (reads.filter((v) => v?.risk === 'crisis').length !== 1) out.push('R6_no_risk_read');
  return out;
}

/** Whether this turn would get L2, or every row that blocks it, in order. */
export function gradeTurn(input: GradeInput): Grade {
  const { detection: d, verdict, reads, call, companion } = input;
  const lines = [input.latest, ...input.earlier];
  const failed: BlockReason[] = [];
  const block = (blocked: boolean, reason: BlockReason): void => {
    if (blocked) failed.push(reason);
  };
  block(input.main !== 'guide', 'not_guide');
  block(
    verdict?.risk === 'imminent' || !!reads?.some((v) => v?.risk === 'imminent'),
    'R1_imminent'
  );
  block(verdict?.subject !== 'self' || d.subject === 'third_party', 'R2_third_party');
  block(d.isCrisis || d.severity !== 0 || d.indicators.length > 0, 'R4_pattern');
  const minor =
    !call || ageSignal(call) || derivedHold(call) || lines.some((l) => statesUnder18(l, companion));
  block(minor, 'R5_minor');
  block(
    lines.some((l) => abuseDisclosure(l) !== null),
    'R5_abuse'
  );
  failed.push(...readsFailing(reads));
  block(input.priorRisk, 'R7_prior_risk');
  block(endsInSafetyQuestion(companion), 'R7_safety_question');
  block(input.screen !== 'none', 'R7_screen');
  block(!(verdict?.risk === 'crisis' && verdict.subject === 'self'), 'R8_not_crisis_self');
  return failed.length ? { would: null, blockedBy: failed[0], failed } : { would: 'L2' };
}

/** The gate's decision as a main level. */
export const mainOf = (d: { action: 'pass' | 'guide' | 'replace'; about?: string }): MainLevel =>
  d.action === 'guide' && d.about ? 'guide_third_party' : d.action;
