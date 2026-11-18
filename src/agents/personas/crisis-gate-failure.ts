/**
 * A crisis escalation that rejects instead of settling. The reply gate's hold
 * (crisis-gate-hold.ts) releases the held reply as if the read had cleared it,
 * and nothing said so. This counts those turns: one CRISIS_GATE line with the
 * stage and the error's class only, never its message, its stack or the
 * caller's words. The rejection then goes on unchanged, so the gate behaves
 * exactly as before.
 *
 * CRISIS_GATE_FAIL_CLOSED (off by default, owner 2026-11-15): a rejected escalation fails
 * closed. The gate settles it by its stage instead (crisis-gate.ts), and the hold never
 * releases a reply on a rejection.
 *
 * @module CrisisGateFailure
 */

import { flagOn } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'CrisisGate' }); // the gate's own log lines

/** Where the escalation failed: before the classifier's verdict was in, or after it. */
export type EscalationStage = 'before_verdict' | 'after_verdict';

/** CRISIS_GATE_FAIL_CLOSED: a rejected escalation never clears the held reply. */
export const escalationFailsClosed = (env: Record<string, string | undefined>): boolean =>
  flagOn('CRISIS_GATE_FAIL_CLOSED', env);

/** The shape of an error class name: TypeError, AbortError, DOMException. A lone word is not. */
const ERROR_CLASS = /^[A-Z][A-Za-z0-9]{0,58}(Error|Exception)$/;

/**
 * The error's class for the log line. `name` is a writable property, not a guarantee, so a
 * thrower could put any text there, the caller's words included, even a single word. Only a
 * name shaped like an error class is logged; anything else is logged as plain 'Error'.
 */
function className(error: Error): string {
  return ERROR_CLASS.test(error.name) ? error.name : 'Error';
}

/**
 * The escalation built on `verdict`. If it rejects, one line says whether `verdict`
 * had resolved and what class of error it was; then it rejects with the same error,
 * or, given `settle`, settles there for that stage instead.
 */
export function loggedEscalation<V, D>(
  verdict: Promise<V>,
  escalation: (verdict: Promise<V>) => Promise<D>,
  settle?: (stage: EscalationStage, verdict: Promise<V>) => Promise<D>
): Promise<D> {
  let stage: EscalationStage = 'before_verdict';
  const read = verdict.then((value) => {
    stage = 'after_verdict';
    return value;
  });
  return escalation(read).catch((error: unknown) => {
    const errorClass = error instanceof Error ? className(error) : typeof error;
    log.warn({ action: 'escalation_failed', stage, errorClass }, 'CRISIS_GATE');
    if (settle) return settle(stage, read);
    throw error;
  });
}
