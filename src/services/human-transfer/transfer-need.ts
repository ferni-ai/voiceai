/**
 * What the human-transfer detector's signals ask Ferni to do on this turn.
 *
 * CRISIS_LEXICAL_V2 off: evaluateTransferNeed, exactly main. On, with the gate live
 * (legacy-word-checks.ts): a turn whose only risk is suicide or self-harm adds no
 * transfer note of its own. The gate reads those itself, from the same caller words,
 * and gives the crisis guidance or the script. Anything the gate does not read (a medical
 * emergency, danger to others, domestic violence, a child, substances, psychosis) keeps
 * main's decision. The crisis_signals write is the caller's business and is unchanged
 * (better-than-human-builders.ts), so a real crisis still leaves its record.
 *
 * @module services/human-transfer/transfer-need
 */
import { gateDecides, noteWordCheck } from '../safety/legacy-word-checks.js';
import { classifyEscalation } from './escalation-classifier.js';
import { evaluateTransferNeed } from './transfer-flow.js';
import type { CrisisSignals, EscalationDecision } from './types.js';

const FERNI_HANDLES: EscalationDecision = {
  type: 'none',
  urgency: 'informational',
  reason: 'Within life coaching scope',
  confidence: 0.8,
};

/** Suicide or self-harm, and nothing the gate does not read. */
function onlyGateRisk(s: CrisisSignals): boolean {
  const gate = s.suicidalIdeation || s.selfHarmIndicators;
  const other =
    s.medicalEmergency ||
    s.dangerToOthers ||
    s.domesticViolence ||
    s.childSafetyConcern ||
    s.substanceCrisis ||
    s.psychoticSymptoms;
  return gate && !other;
}

/** The transfer decision for this turn's signals (detectCrisisSignals of `userText`). */
export function transferNeed(signals: CrisisSignals, userText: string): EscalationDecision {
  if (!gateDecides()) return evaluateTransferNeed(userText);
  if (!onlyGateRisk(signals)) return classifyEscalation(signals);
  noteWordCheck(
    'human_transfer',
    'deferred_to_gate',
    signals.suicidalIdeation ? 'suicidal' : 'self-harm'
  );
  return FERNI_HANDLES;
}
