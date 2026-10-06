/**
 * The last-resort tool set, used when every other tool load has failed
 * (agent-setup.ts): handoffs to Ferni's team plus endCall.
 *
 * It is built without the persona registry (that may be what failed), but its
 * handoff names come from the same function that names the real handoff tools
 * (assignHandoffToolNames), so they can't drift. Before, it built its own names
 * from ids: "peter-john" became handoffToPeterjohn (the real tool is
 * handoffToPeter) and Maya's own handoffToMaya was offered to Maya.
 *
 * @module agents/multi-agent/emergency-toolset
 */

import { CANONICAL_IDS, DISPLAY_NAMES } from '../../personas/persona-ids.js';
import {
  assignHandoffToolNames,
  type NameableAgent,
} from '../../tools/handoff/handoff-tool-naming.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'EmergencyToolset' });

/** Ferni first (the coordinator), then the team. */
const TEAM_IDS = [
  CANONICAL_IDS.COACH,
  CANONICAL_IDS.BUDGETER,
  CANONICAL_IDS.RESEARCHER,
  CANONICAL_IDS.PLANNER,
  CANONICAL_IDS.COMMUNICATOR,
  CANONICAL_IDS.SAGE,
] as const;

const TEAM: NameableAgent[] = TEAM_IDS.map((id) => ({
  id,
  name: DISPLAY_NAMES[id],
  manifest: { team: { membership: 'ferni-team' } },
}));

/** Handoff tool name per persona id, named exactly as the real handoff tools are. */
function emergencyHandoffNames(): Map<string, string> {
  return assignHandoffToolNames(TEAM, TEAM[0]);
}

/** Handoffs to everyone on Ferni's team except `currentPersonaId`, plus endCall. */
export function buildEmergencyToolset(currentPersonaId: string): Record<string, unknown> {
  const tools: Record<string, unknown> = {};
  for (const [targetId, toolName] of emergencyHandoffNames()) {
    if (targetId === currentPersonaId) continue;
    const name = DISPLAY_NAMES[targetId as (typeof TEAM_IDS)[number]];
    tools[toolName] = {
      name: toolName,
      description: `Transfer the conversation to ${name}`,
      parameters: {
        type: 'object',
        properties: { reason: { type: 'string', description: 'Why transferring' } },
      },
    };
  }
  tools.endCall = {
    name: 'endCall',
    description: 'End the conversation when the user wants to go',
    parameters: { type: 'object', properties: {} },
  };
  log.warn(
    { personaId: currentPersonaId, emergencyToolCount: Object.keys(tools).length },
    '🚨 EMERGENCY TOOLS ACTIVE - Only handoffs + endCall available!'
  );
  return tools;
}
