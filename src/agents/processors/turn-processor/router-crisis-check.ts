/**
 * ROUTER_EXEC_AFTER_CRISIS_READ: the turn's answer to "may a router run a tool on its own, or a
 * reply skip the reply model?" (owner rule: no tools run on crisis turns).
 *
 * With the flag on, only 'allowed' says yes. That needs every read of the turn settled and
 * clear: the patterns, the classifier (awaited within its existing timeout) and a soft check-in
 * (turn-crisis.ts bypassAllowed), and no crisis risk noted on the call by earlier reads
 * (crisisRiskThisCall, where the reply gate's reads land; its read of this turn starts after
 * routing). A live classifier read with no verdict, or a read that throws, is 'failed'. Any other
 * no is 'held'. With the flag off the routers get a null check and the bypass asks bypassAllowed,
 * as on main.
 *
 * A router that runs outside processTurn (transcript-handler.ts runs FTIS on the final transcript)
 * has no TurnCrisis: turnSettledToolCheck answers 'allowed' only once a crisis read of that turn
 * has started and the call's reads settled with nothing holding the call (crisisTurnSettled).
 *
 * @module agents/processors/turn-processor/router-crisis-check
 */
import { flagOn } from '../../../config/env-flag.js';
import { crisisRiskThisCall } from '../../../services/safety/index.js';
import type {
  AutoExecuteCheck,
  AutoExecuteGate,
  AutoExecuteOutcome,
} from '../../../tools/semantic-router/integration/index.js';
import { crisisTurnSettled } from '../../../utils/crisis-memory-hold.js';
import type { TurnCrisis } from './turn-crisis.js';

/** What processTurn hands the routers and asks before any reply that skips the reply model. */
export interface RouterCrisisChecks {
  /** Spread into each router's context; a null check with the flag off. */
  gate: AutoExecuteGate;
  /** Whether a reply may skip the reply model (FTIS bypass, semantic short-circuit). */
  bypassAllowed: () => Promise<boolean>;
  /**
   * Whether the routing result's direct tool reply is refused. Flag off: the pattern read alone,
   * as on main. Flag on: anything but 'allowed'.
   */
  blocksDirectReply: () => Promise<boolean>;
}

/** The router checks for one turn, from its crisis reads and the call they belong to. */
export function routerCrisisChecks(
  turnCrisis: TurnCrisis,
  call: string | undefined,
  userText: string,
  env: NodeJS.ProcessEnv = process.env
): RouterCrisisChecks {
  if (!flagOn('ROUTER_EXEC_AFTER_CRISIS_READ', env)) {
    return {
      gate: { autoExecuteCheck: null },
      bypassAllowed: turnCrisis.bypassAllowed,
      blocksDirectReply: () => Promise.resolve(turnCrisis.patterns.isCrisis),
    };
  }
  const check = async (): Promise<AutoExecuteOutcome> => {
    try {
      if (await turnCrisis.classifierReadFailed()) return 'failed';
      if (!(await turnCrisis.bypassAllowed())) return 'held';
      return call && crisisRiskThisCall(call, userText) ? 'held' : 'allowed';
    } catch {
      return 'failed';
    }
  };
  const bypassAllowed = async (): Promise<boolean> => (await check()) === 'allowed';
  return {
    gate: { autoExecuteCheck: check },
    bypassAllowed,
    blocksDirectReply: async () => !(await bypassAllowed()),
  };
}

/**
 * The check for a router outside processTurn: 'allowed' only when a crisis read of these words
 * started and the call's reads settled with nothing holding the call; no read, a late read or
 * any hold is 'held', and a read that throws is 'failed'. Null with the flag off.
 */
export function turnSettledToolCheck(
  sessionId: string,
  words: string,
  env: NodeJS.ProcessEnv = process.env
): AutoExecuteCheck | null {
  if (!flagOn('ROUTER_EXEC_AFTER_CRISIS_READ', env)) return null;
  return async () => {
    try {
      return (await crisisTurnSettled(sessionId, words)) ? 'allowed' : 'held';
    } catch {
      return 'failed';
    }
  };
}
