/**
 * Names and descriptions of generated handoff tools (handoff-factory.ts).
 *
 * @module tools/handoff/handoff-tool-naming
 */

import type { Agent } from '../../personas/registry/unified-registry.js';

/** What the agent does, for the tool description: never "undefined". */
export function specialtyOf(agent: Agent): string | undefined {
  const text = [agent.roleDescription, agent.description].find(
    (t): t is string => typeof t === 'string' && t.trim().length > 0
  );
  return text?.trim().replace(/\.+$/, '');
}
