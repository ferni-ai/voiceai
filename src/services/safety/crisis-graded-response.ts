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
 * L2 needs every row clear: main's full crisis guide; plain text the rows can read; no
 * imminent read; about the caller, with no one else named in the turn; no one down, hurt
 * or near means on any line; no pattern signal at all; a calm voice or none heard; no sign
 * of a caller under 18 (owner exemption ignored); no abuse disclosure; at least two reads of
 * the turn, none missing, exactly one crisis and no two agreeing on risk; no risk on the call
 * before this turn; Ferni's line did not ask about safety, life or a plan; no grounded-release
 * screen open; and the read is crisis about the caller. The wide rows live in
 * crisis-graded-blocks.ts and fail closed: a false hit only keeps main's full guide.
 *
 * @module CrisisGradedResponse
 */

import { ageSignal, derivedHold, statesUnder18 } from '../../utils/minor-care.js';
import { abuseDisclosure } from './abuse-disclosure.js';
import type { CrisisVerdict } from './crisis-classifier.js';
import {
  asksAnythingSafety,
  downOrMeans,
  mayBeUnder18,
  mayDiscloseAbuse,
  namesSomeoneElse,
  unreadable,
} from './crisis-graded-blocks.js';
import type { CrisisDetectionResult, VoiceEmotionContext } from './crisis-guard.js';
import { asksAboutSafety } from './crisis-lone-imminent.js';

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
  /** The turn's voice read, as the patterns got it; undefined when none was heard. */
  voice?: VoiceEmotionContext;
}

/** Every row that can block L2, in the order gradeTurn checks them. */
export const BLOCK_REASONS = [
  'not_guide',
  'R0_unreadable',
  'R1_imminent',
  'R2_third_party',
  'R2_someone_else',
  'R3_down_or_means',
  'R4_pattern',
  'R4_voice',
  'R5_minor',
  'R5_abuse',
  'R6_reads_missing',
  'R6_read_null',
  'R6_single_read',
  'R6_agreeing_reads',
  'R6_no_risk_read',
  'R7_prior_risk',
  'R7_safety_question',
  'R7_screen',
  'R8_not_crisis_self',
] as const;

export type BlockReason = (typeof BLOCK_REASONS)[number];

export type Grade =
  { would: 'L2' } | { would: null; blockedBy: BlockReason; failed: BlockReason[] };

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

/** The voices R4_voice lets through; main reads a voice below this confidence as none. */
const CALM_VOICES = new Set(['neutral', 'calm', 'happy', 'content', 'relaxed']);

/** Fail closed: a voice heard as anything but calm, or strained, whatever the words say. */
function voiceNotCalm(voice: VoiceEmotionContext | undefined): boolean {
  if (!voice || (voice.confidence ?? 1) <= 0.5) return false;
  return !CALM_VOICES.has(voice.primary.trim().toLowerCase()) || voice.intensity > 0.8;
}

/** Any sign of a caller under 18: no call id, an age heard or held, or a line that says so. */
function minorSign(
  call: string | undefined,
  lines: readonly string[],
  companion?: string
): boolean {
  if (!call || ageSignal(call) || derivedHold(call)) return true;
  return lines.some((l) => statesUnder18(l, companion) || mayBeUnder18(l, companion));
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
  // R0, R2b, R3 and the wide R5/R7 readers fail closed: a false hit keeps main's guide.
  block([...lines, companion ?? ''].some(unreadable), 'R0_unreadable');
  block(
    verdict?.risk === 'imminent' || !!reads?.some((v) => v?.risk === 'imminent'),
    'R1_imminent'
  );
  block(verdict?.subject !== 'self' || d.subject === 'third_party', 'R2_third_party');
  block(namesSomeoneElse(input.latest), 'R2_someone_else'); // "He collapsed.", whatever the read
  block(lines.some(downOrMeans), 'R3_down_or_means'); // someone else down is 911 first
  block(d.isCrisis || d.severity !== 0 || d.indicators.length > 0, 'R4_pattern');
  block(voiceNotCalm(input.voice), 'R4_voice'); // "fearful" is in neither distress list
  block(minorSign(call, lines, companion), 'R5_minor');
  block(
    lines.some((l) => abuseDisclosure(l) !== null || mayDiscloseAbuse(l)),
    'R5_abuse'
  );
  failed.push(...readsFailing(reads));
  block(input.priorRisk, 'R7_prior_risk');
  // an answer to Ferni's safety question is never a non-answer
  block(asksAboutSafety(companion) || asksAnythingSafety(companion), 'R7_safety_question');
  block(input.screen !== 'none', 'R7_screen');
  block(!(verdict?.risk === 'crisis' && verdict.subject === 'self'), 'R8_not_crisis_self');
  return failed.length ? { would: null, blockedBy: failed[0], failed } : { would: 'L2' };
}

/** The gate's decision as a main level. */
export const mainOf = (d: { action: 'pass' | 'guide' | 'replace'; about?: string }): MainLevel =>
  d.action === 'guide' && d.about ? 'guide_third_party' : d.action;
