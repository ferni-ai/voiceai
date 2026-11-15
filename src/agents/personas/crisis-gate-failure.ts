/**
 * A crisis escalation that rejects instead of settling. The reply gate's hold
 * (crisis-gate-hold.ts) releases the held reply as if the read had cleared it,
 * and nothing said so. This counts those turns: one CRISIS_GATE line with the
 * stage and the error's class only, never its message, its stack or the
 * caller's words. The rejection then goes on unchanged, so the gate behaves
 * exactly as before.
 *
 * @module CrisisGateFailure
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'CrisisGate' }); // the gate's own log lines

/** Where the escalation failed: before the classifier's verdict was in, or after it. */
type EscalationStage = 'before_verdict' | 'after_verdict';

/**
 * The escalation built on `verdict`. If it rejects, one line says whether `verdict`
 * had resolved and what class of error it was; then it rejects with the same error.
 */
export function loggedEscalation<V, D>(
  verdict: Promise<V>,
  escalation: (verdict: Promise<V>) => Promise<D>
): Promise<D> {
  let stage: EscalationStage = 'before_verdict';
  const read = verdict.then((value) => {
    stage = 'after_verdict';
    return value;
  });
  return escalation(read).catch((error: unknown) => {
    const errorClass = error instanceof Error ? error.name : typeof error;
    log.warn({ action: 'escalation_failed', stage, errorClass }, 'CRISIS_GATE');
    throw error;
  });
}
