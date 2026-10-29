/**
 * CRISIS_CLASSIFIER_CHECK, the gate's steps (crisis-gate.ts) around the per-call check state in
 * crisis-classifier-check.ts:
 * - checkOrScript: the check only when the second read (crisis-classifier-check-situation.ts)
 *   finds no means, place, plan or injury; any other read keeps the script.
 * - watchCheck: the script after CHECK_ANSWER_MS of silence after the check.
 * - checkTurn and checkVerdict: the answer to the check, and after a clear (afterClear) any
 *   later caller risk read or pattern decision gets the alarm's script, not guidance or the
 *   model: the call keeps its alarm (eval of #2961, round 2).
 *
 * @module CrisisClassifierCheckTurn
 */

import { setTimeout as sleep } from 'node:timers/promises';
import { flagOn } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { CrisisVerdict } from './crisis-classifier.js';
import {
  CHECK_ANSWER_MS,
  CLASSIFIER_CHECK,
  checkAnswer,
  checkInstead,
  checkOpen,
  checkUnanswered,
  clearedScript,
  type AlarmTurn,
  type CheckAnswer,
  type Replace,
} from './crisis-classifier-check.js';
import type { Caller } from './crisis-classifier-check-minor.js';
import type { CheckSituation } from './crisis-classifier-check-situation.js';
import type { CrisisDetectionResult } from './crisis-guard.js';

const log = createLogger({ module: 'CrisisClassifierCheck' });

/**
 * Rule 1 with the second read: asks it only when nothing else keeps the script, then
 * checkInstead. Fails closed: a failed read is 'unread', which keeps the script.
 */
export async function checkOrScript<D extends { action: string }>(
  stronger: D,
  turn: AlarmTurn,
  read: () => Promise<CheckSituation>
): Promise<D> {
  try {
    if (stronger.action !== 'replace' || !flagOn('CRISIS_CLASSIFIER_CHECK', turn.env)) {
      return stronger;
    }
    const asks = checkOpen(turn);
    const situation = asks ? await read().catch((): CheckSituation => 'unread') : undefined;
    return checkInstead(stronger, { ...turn, situation });
  } catch {
    return stronger;
  }
}

/**
 * Rule 5: after a clear, a later turn's risk (a pattern decision, or a crisis or imminent read
 * about the caller) gets the alarm's script, not guidance or the model: the call keeps its alarm.
 */
export function afterClear(
  call: string | undefined,
  risk: { decision?: { action: string }; verdict?: CrisisVerdict | null }
): Replace | null {
  const script = clearedScript(call);
  if (!script) return null;
  const { decision, verdict } = risk;
  const read =
    verdict?.risk === 'imminent' || (verdict?.risk === 'crisis' && verdict.subject === 'self');
  if (!read && (!decision || decision.action === 'pass')) return null;
  log.info({ outcome: 'script', why: 'after_clear' }, 'CRISIS_CLASSIFIER_CHECK');
  return script;
}

/**
 * The gate's step once the turn's read is in: an answer to the check that does not clear it, or a
 * risk read after a clear (afterClear), gets the script; null lets the turn go on.
 */
export async function checkVerdict(
  check: CheckAnswer | null,
  call: string | undefined,
  verdict: CrisisVerdict | null,
  reads?: () => Promise<ReadonlyArray<CrisisVerdict | null>>
): Promise<Replace | null> {
  if (check) return (await check.clears(verdict, reads)) ? null : check.script;
  return afterClear(call, { verdict });
}

/**
 * The gate's step for a turn: the answer to the call's check (`check`), and the decision: the
 * script at once when nothing read can clear it, the alarm's script for a pattern after a clear
 * (afterClear), or the patterns' decision unchanged.
 */
export function checkTurn<D extends { action: string }>(
  said: Caller & { ferni?: readonly string[] },
  detection: CrisisDetectionResult,
  patterns: D
): { check: CheckAnswer | null; decision: D | Replace } {
  const check = checkAnswer(said.call, said, detection);
  if (check) return { check, decision: check.now ?? patterns };
  return { check, decision: afterClear(said.call, { decision: patterns }) ?? patterns };
}

/** Rule 3: a check spoken here gets the script after CHECK_ANSWER_MS if the history shows no answer. */
export function watchCheck(
  session: object,
  call: string | undefined,
  gate: { decision: { action: string }; escalation: Promise<{ action: string } | null> | null },
  words: (history: never) => { latest: string; companion?: string },
  wait: (ms: number) => Promise<unknown> = async (ms) => sleep(ms, undefined, { ref: false })
): void {
  const arm = (decision: { action: string; script?: string } | null): void => {
    if (decision?.script !== CLASSIFIER_CHECK) return;
    wait(CHECK_ANSWER_MS)
      .then(() => {
        const live = session as { history?: { items?: unknown }; say?: (text: string) => unknown };
        const history = live.history?.items ? words(live.history as never) : null;
        const script = checkUnanswered(call, history);
        if (script) live.say?.(script.script);
      })
      .catch(() => log.warn({}, 'Check silence script not spoken'));
  };
  arm(gate.decision);
  gate.escalation?.then(arm).catch(() => undefined);
}
