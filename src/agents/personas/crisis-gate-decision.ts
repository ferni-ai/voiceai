/**
 * The reply gate's decisions (crisis-gate.ts): what a crisis read calls for, and whether a
 * classifier read raises what the patterns decided. A read only ever raises it.
 *
 * @module CrisisGateDecision
 */

import { disclosureGuidance, guideLineOf, type GuideLine } from '../../services/safety/index.js';
import {
  buildCrisisGuidance,
  guardFromDetection,
  type CrisisDetectionResult,
} from '../safety/crisis-guard.js';
import { crisisKindOf } from '../safety/crisis-event-record.js'; // CRISIS_EVENT_RECORD

export type CrisisGateDecision =
  | { action: 'pass' }
  // about: someone the caller knows is at risk (MINOR_CRISIS_CARE); crisis: the caller is.
  // line: the line a crisis read's reply must name (CRISIS_GUIDED_LINE_FLOOR); soft guides have none.
  | { action: 'guide'; guidance: string; about?: 'third_party'; crisis?: true; line?: GuideLine }
  | { action: 'replace'; script: string; kind?: ReturnType<typeof crisisKindOf> };
export type GuideDecision = Extract<CrisisGateDecision, { action: 'guide' }>;

// By action only: an emergency replace can't outrank a crisis-line replace that came first.
const RANK = { pass: 0, guide: 1, replace: 2 } as const;

/** A crisis read's guide: its guidance and the line its reply must name, when it has one. */
export const crisisGuide = (guidance: string, line: GuideLine | undefined): GuideDecision =>
  line ? { action: 'guide', guidance, line } : { action: 'guide', guidance };

/** decisionFor's own-crisis mark (CRISIS_QUIET_FROM_GATE): the caller is the one at risk. */
const own = (decision: GuideDecision): GuideDecision => ({ ...decision, crisis: true });

/** `latest`: the caller's last line, which also picks the guide line's language (guideLineOf). */
export function decisionFor(crisis: CrisisDetectionResult, latest?: string): CrisisGateDecision {
  if (guardFromDetection(crisis).shouldBlock && crisis.suggestedResponse) {
    return { action: 'replace', script: crisis.suggestedResponse, kind: crisisKindOf(crisis) };
  }
  if (crisis.isCrisis && crisis.subject === 'third_party') {
    const guided = crisisGuide(buildCrisisGuidance(crisis), guideLineOf(crisis, false, latest));
    return { ...guided, about: 'third_party' };
  }
  if (crisis.isCrisis) {
    const disclosure = disclosureGuidance(crisis);
    return own(
      crisisGuide(
        disclosure ?? buildCrisisGuidance(crisis),
        guideLineOf(crisis, disclosure !== null, latest)
      )
    );
  }
  return { action: 'pass' };
}

/** What the patterns made of a turn: the detection, its decision, and the caller's last line. */
export interface PatternTurn {
  detection: CrisisDetectionResult;
  decision: CrisisGateDecision;
  /** A grounded release's gentle offer: any crisis read replaces it, even at the same rank. */
  gentle: boolean;
  latest?: string;
}

/**
 * The decision a read merged into the turn's detection raises the patterns' to, or null when it
 * raises nothing. `rerouted`: the read changed whom the risk is about, which always acts.
 */
export function raisedTo(
  turn: PatternTurn,
  merged: CrisisDetectionResult,
  rerouted = false
): CrisisGateDecision | null {
  if (merged === turn.detection) return null;
  const stronger = decisionFor(merged, turn.latest);
  const higher = RANK[stronger.action] > RANK[turn.decision.action];
  return higher || turn.gentle || rerouted ? stronger : null;
}
