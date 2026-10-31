/**
 * The reply gate's CRISIS_CLASSIFIER_CHECK steps for one turn
 * (services/safety/crisis-classifier-check-turn.ts), moved out of
 * startCrisisGate (crisis-gate.ts) unchanged so it stays under the
 * 150-line function limit. The gate calls each step where it ran inline.
 *
 * @module CrisisGateCheck
 */

import type { llm } from '@livekit/agents';
import {
  turnVerdicts,
  type CrisisGenerateFn,
  type CrisisVerdict,
} from '../../services/safety/crisis-classifier.js';
import {
  checkOrScript,
  checkTurn,
  checkVerdict,
} from '../../services/safety/crisis-classifier-check-turn.js';
import { readCheckSituation } from '../../services/safety/crisis-classifier-check-situation.js';
import type { CrisisDetectionResult } from '../safety/crisis-guard.js';
import { callerUserId, callerWords, callTranscript, sessionScope } from './crisis-gate-words.js';

interface Action {
  action: string;
}

/**
 * The turn's check: `decision` is the answer to a classifier-only alarm's
 * check, or a turn after a clear (else the patterns' decision unchanged).
 */
export function gateCheck<D extends Action>(
  chatCtx: llm.ChatContext,
  userData: unknown,
  detection: CrisisDetectionResult,
  patterns: D,
  options: { env?: Record<string, string | undefined>; generate?: CrisisGenerateFn }
) {
  const { env = process.env, generate } = options;
  const { latest, earlier, companion, ferni } = callerWords(chatCtx);
  const said = { latest, earlier, companion };
  const call = sessionScope(userData);
  const caller = { call, userId: callerUserId(userData), lines: callTranscript(chatCtx), env };
  const { check, decision } = checkTurn(
    { latest, companion, ferni, ...caller },
    detection,
    patterns
  );
  return {
    decision,
    /** An answer to the check with no live read to screen it gets the script. */
    unread: <E extends Action>(d: E) => check?.unread(d) ?? d,
    /** Only a clear answer every read lets stand keeps this turn's reply; after a clear, the script. */
    verdict: async (verdict: CrisisVerdict | null, scope: string | undefined) => {
      const reads = scope ? async () => turnVerdicts(scope, said) : undefined;
      return checkVerdict(check, call, verdict, reads);
    },
    /** Only the words spoken change; everything before this saw the read. */
    alarm: async <S extends Action>(stronger: S, priorRisk: boolean): Promise<S> => {
      if (check) return stronger;
      const alarm = { ...said, ...caller, patterns: decision.action, detection, priorRisk };
      const situation = async () =>
        readCheckSituation(said, { generate, env, lines: caller.lines });
      return checkOrScript(stronger, alarm, situation);
    },
  };
}
