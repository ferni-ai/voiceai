/**
 * What the human-transfer detector's signals ask Ferni to do on this turn.
 *
 * CRISIS_LEXICAL_V2 off: evaluateTransferNeed, exactly main. On, the detector reads the
 * same words exactly as main does (every signal, severity and crisis_signals write is
 * main's); only its transfer note may be left to the crisis gate, and only when the gate
 * is sure to act on this very line:
 * - the gate is live (CRISIS_GUARD_MODE),
 * - the voice path is the cascade, whose llmNode runs the gate (the realtime models reply
 *   without it),
 * - the gate's own pattern guard reads crisis in exactly the words the gate scores
 *   (`gateWords`: every caller message since Ferni's last line, joined, from the builder's
 *   injection-builders/gate-words.ts), so no classifier verdict is needed for the gate to
 *   guide or replace the reply; without those words the note never defers,
 * - and the turn's only risk is suicide or self-harm. A medical emergency, danger to
 *   others, domestic violence, a child, substances or psychosis keep main's note: the gate
 *   does not read them.
 * Then the note would repeat the gate's own crisis guidance. Otherwise main's note stays.
 * performSafetyCheck never defers. Each deferral is logged (CRISIS_LEXICAL, a reason only).
 *
 * @module services/human-transfer/transfer-need
 */
import { flagOn } from '../../config/env-flag.js';
import { getProviderIdSync } from '../../config/model-provider-config.js';
import { resolveCrisisGuardMode, scoreCrisisLanguage } from '../safety/index.js';
import { createLogger } from '../../utils/safe-logger.js';
import { evaluateTransferNeed } from './transfer-flow.js';
import type { CrisisSignals, EscalationDecision } from './types.js';

const log = createLogger({ module: 'TransferNeed' });

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

/** The live gate is sure to act on the words it scores: its own pattern guard reads crisis. */
function gateActsOn(gateWords: string, env: Record<string, string | undefined>): boolean {
  return (
    flagOn('CRISIS_LEXICAL_V2', env) &&
    resolveCrisisGuardMode(env) === 'live' &&
    getProviderIdSync(env) === 'cartesia-cascade' &&
    scoreCrisisLanguage(gateWords).isCrisis
  );
}

/**
 * The transfer decision for this turn's signals (detectCrisisSignals of `userText`).
 * `gateWords` are the words the gate scores this turn; without them, main's decision.
 */
export function transferNeed(
  signals: CrisisSignals,
  userText: string,
  gateWords?: string,
  env: Record<string, string | undefined> = process.env
): EscalationDecision {
  const defer = gateWords !== undefined && onlyGateRisk(signals) && gateActsOn(gateWords, env);
  if (!defer) return evaluateTransferNeed(userText);
  const kind = signals.suicidalIdeation ? 'suicidal' : 'self-harm';
  log.info({ check: 'human_transfer', reason: 'deferred_to_gate', kind }, 'CRISIS_LEXICAL');
  return FERNI_HANDLES;
}
