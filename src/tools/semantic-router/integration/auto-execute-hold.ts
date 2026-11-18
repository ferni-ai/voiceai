/**
 * The one question a router asks before it runs a matched tool on its own: may this turn run
 * it? The turn hands the answer in (CRISIS_BLOCKS_AUTO_TOOLS: the turn's crisis reads,
 * turn-crisis.ts autoToolsAllowed); a router handed nothing runs the tool as before. A check
 * that throws holds the tool, so a failed read never lets one through. A held tool goes to
 * the reply model, which answers the turn with its crisis guidance.
 *
 * @module tools/semantic-router/integration/auto-execute-hold
 */
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'auto-execute-hold' });

/** A routing context that may carry the turn's answer. */
export interface AutoExecuteGate {
  /** Asked before a tool runs on its own; false holds it for the reply model. */
  autoExecuteAllowed?: () => Promise<boolean>;
}

/** Whether the tool must wait for the reply model. Logs the router and a count, no words. */
export async function autoExecuteHeld(gate: AutoExecuteGate, router: string): Promise<boolean> {
  if (!gate.autoExecuteAllowed) return false;
  const allowed = await gate.autoExecuteAllowed().catch(() => false);
  if (!allowed) log.info({ router, held: 1 }, 'AUTO_TOOL_HELD');
  return !allowed;
}
