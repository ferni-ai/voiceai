/**
 * A crisis escalation that rejects instead of settling. The reply gate's hold
 * (crisis-gate-hold.ts) releases the held reply as if the read had cleared it,
 * and nothing said so. This counts those turns: one CRISIS_GATE line with the
 * stage and the error's class only, never its message, its stack or the
 * caller's words. The rejection then goes on unchanged, so the gate behaves
 * exactly as before.
 *
 * CRISIS_GATE_FAIL_CLOSED (off by default, owner 2026-11-15): a rejected escalation fails
 * closed. It settles by its stage instead (gateEscalation), and the hold never releases a
 * reply on a rejection (crisis-gate-hold.ts).
 *
 * @module CrisisGateFailure
 */

import { flagOn } from '../../config/env-flag.js';
import { checkin, noteCrisisRisk, type CrisisVerdict } from '../../services/safety/index.js';
import { createLogger } from '../../utils/safe-logger.js';
import { applyClassifierVerdict } from '../safety/crisis-guard.js';
import { raisedTo, type CrisisGateDecision, type PatternTurn } from './crisis-gate-decision.js';

const log = createLogger({ module: 'CrisisGate' }); // the gate's own log lines

type Env = Record<string, string | undefined>;

/** Where the escalation failed: before the classifier's verdict was in, or after it. */
type EscalationStage = 'before_verdict' | 'after_verdict';

/** CRISIS_GATE_FAIL_CLOSED: a rejected escalation never clears the held reply. */
export const escalationFailsClosed = (env: Env): boolean => flagOn('CRISIS_GATE_FAIL_CLOSED', env);

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
function loggedEscalation<V, D>(
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

type Read = CrisisVerdict | null | undefined;
type Decided = Promise<CrisisGateDecision | null>;

/** A reply gate turn (crisis-gate.ts), as its escalation needs it. */
interface GateTurn extends PatternTurn {
  /** The classifier-timeout check-in's view of the turn (crisis-timeout-checkin.ts). */
  checkin: Parameters<typeof checkin.escalation>[1];
  /** The gate's escalation of a read: every easing step, then the decision. */
  escalate: (verdict: CrisisVerdict | null) => Decided;
  call: string | undefined;
  env: Env;
}

/**
 * The reply gate's escalation of its read: the timeout check-in or the gate's own steps,
 * logged if it rejects. With CRISIS_GATE_FAIL_CLOSED on a rejection settles by its stage. Before
 * the verdict it is a failed read: the timeout path, its check-in on even with
 * CRISIS_TIMEOUT_CHECKIN off. After it, the classifier's own decision stands, with no easing step.
 */
export function gateEscalation(read: Promise<Read>, turn: GateTurn): Decided {
  const escalation = (verdict: Promise<Read>): Decided =>
    checkin.escalation(verdict, turn.checkin, turn.escalate);
  const settle = async (stage: EscalationStage, verdict: Promise<Read>): Decided => {
    if (stage === 'before_verdict') {
      const env = { ...turn.env, CRISIS_TIMEOUT_CHECKIN: 'on' };
      return checkin.escalation(Promise.resolve(null), { ...turn.checkin, env }, turn.escalate);
    }
    const value = await verdict;
    const standing =
      value === undefined ? null : raisedTo(turn, applyClassifierVerdict(turn.detection, value));
    if (standing) {
      noteCrisisRisk(turn.call);
      log.info({ action: standing.action, source: 'fail_closed' }, 'CRISIS_GATE');
    }
    return standing;
  };
  return loggedEscalation(read, escalation, escalationFailsClosed(turn.env) ? settle : undefined);
}
