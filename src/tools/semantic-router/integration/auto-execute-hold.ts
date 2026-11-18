/**
 * The one question a router asks before it runs a matched tool on its own: may this turn run
 * it? Every caller hands the turn's check in (ROUTER_EXEC_AFTER_CRISIS_READ: the turn's crisis
 * reads, router-crisis-check.ts). The field is required, so a caller that forgets it fails to
 * compile; null says the caller has no check. Only 'allowed' runs the tool: a hold, a failed read
 * and a check that throws all keep it for the reply model, which answers the turn with its crisis
 * guidance. With the flag on, no check fails closed (held, logged no_check); with it off, a router
 * handed null runs the tool as on main.
 *
 * Each check logs AUTO_TOOL_CHECK with the router, the outcome and how long the turn waited for
 * it, so the cost of waiting on an ordinary tool turn can be measured. Ids and numbers only.
 *
 * @module tools/semantic-router/integration/auto-execute-hold
 */
import { flagOn } from '../../../config/env-flag.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'auto-execute-hold' });

/** The turn's word on running a tool on its own: a crisis read holds it, a failed read fails it. */
export type AutoExecuteOutcome = 'allowed' | 'held' | 'failed';

/** Asked before a tool runs on its own; anything but 'allowed' keeps it for the reply model. */
export type AutoExecuteCheck = () => Promise<AutoExecuteOutcome>;

/** A routing context: it always says what check the turn has, null for none. */
export interface AutoExecuteGate {
  sessionId?: string;
  autoExecuteCheck: AutoExecuteCheck | null;
}

/** Whether the tool must wait for the reply model. */
export async function autoExecuteHeld(
  gate: AutoExecuteGate,
  router: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<boolean> {
  const check = gate.autoExecuteCheck;
  if (!check && !flagOn('ROUTER_EXEC_AFTER_CRISIS_READ', env)) return false;
  const started = performance.now();
  // A check that throws, even before it returns a promise, is a failed read
  const outcome = check
    ? await Promise.resolve()
        .then(check)
        .catch((): AutoExecuteOutcome => 'failed')
    : ('no_check' as const);
  const waitMs = Math.round(performance.now() - started);
  log.info({ sessionId: gate.sessionId, router, outcome, waitMs }, 'AUTO_TOOL_CHECK');
  return outcome !== 'allowed';
}
