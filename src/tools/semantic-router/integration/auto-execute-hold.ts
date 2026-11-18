/**
 * The one question a router asks before it runs a matched tool on its own: may this turn run
 * it? The turn hands the check in (ROUTER_EXEC_AFTER_CRISIS_READ: the turn's crisis reads,
 * turn-crisis.ts autoToolsCheck); a router handed nothing runs the tool as before. Only
 * 'allowed' runs the tool: a hold, a failed read and a check that throws all keep it for the
 * reply model, which answers the turn with its crisis guidance.
 *
 * Each check logs AUTO_TOOL_CHECK with the router, the outcome and how long the turn waited for
 * it, so the cost of waiting on an ordinary tool turn can be measured. Ids and numbers only.
 *
 * @module tools/semantic-router/integration/auto-execute-hold
 */
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'auto-execute-hold' });

/** The turn's word on running a tool on its own: a crisis read holds it, a failed read fails it. */
export type AutoExecuteOutcome = 'allowed' | 'held' | 'failed';

/** A routing context that may carry the turn's check. */
export interface AutoExecuteGate {
  sessionId?: string;
  /** Asked before a tool runs on its own; anything but 'allowed' keeps it for the reply model. */
  autoExecuteCheck?: () => Promise<AutoExecuteOutcome>;
}

/** Whether the tool must wait for the reply model. */
export async function autoExecuteHeld(gate: AutoExecuteGate, router: string): Promise<boolean> {
  if (!gate.autoExecuteCheck) return false;
  const started = performance.now();
  const outcome = await gate.autoExecuteCheck().catch((): AutoExecuteOutcome => 'failed');
  const waitMs = Math.round(performance.now() - started);
  log.info({ sessionId: gate.sessionId, router, outcome, waitMs }, 'AUTO_TOOL_CHECK');
  return outcome !== 'allowed';
}
