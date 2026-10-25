/**
 * Alex's planning tools as chief of staff (ALEX_CHIEF_OF_STAFF=on).
 *
 * Handed the call, a persona gets the first agent's essential set
 * (HANDOFF_FULL_TOOLS, essential-tool-set.ts) or the gateway's Tier 0, plus the
 * everyday basics. Neither has completeTask, the commitment tools or the goal
 * tools, and the goal tools otherwise load only on the word "goal"
 * (dynamic-loader/topic-mappings.ts). The persona manifest's tool block decides
 * nothing here: the handoff path never reads it.
 *
 * So Alex gets whichever CHIEF_OF_STAFF_TOOLS he lacks, built for him, before
 * the cap; while the flag is on they are must-keep tools (tool-config.ts).
 *
 * @module agents/multi-agent/chief-of-staff-tools
 */
import {
  alexChiefOfStaffEnabled,
  CHIEF_OF_STAFF_ID,
  type ChiefOfStaffTool,
} from '../../config/alex-chief-of-staff-flag.js';
import { getCanonicalPersonaId } from '../../personas/voice-registry.js';
import type { ToolContext, ToolDomain } from '../../tools/registry/types.js';
import { withRegistryTools } from './registry-tools.js';

/** Each chief-of-staff tool and the domain it is registered in. */
export const CHIEF_OF_STAFF_DOMAINS: Readonly<Record<ChiefOfStaffTool, ToolDomain>> = {
  addTask: 'productivity',
  getTasks: 'productivity',
  completeTask: 'productivity',
  recordCommitment: 'productivity',
  getCommitments: 'productivity',
  completeCommitment: 'productivity',
  setReminder: 'productivity',
  getReminders: 'productivity',
  getCalendarToday: 'calendar',
  getCalendarWeek: 'calendar',
  createCalendarEvent: 'calendar',
  manageGoal: 'life-planning',
  goalsSummary: 'life-planning',
};

/**
 * `tools` plus the chief-of-staff tools it lacks, when the agent is Alex and
 * the flag is on; otherwise `tools` unchanged.
 */
export async function withChiefOfStaffTools<T>(
  tools: Record<string, T>,
  ctx: ToolContext
): Promise<Record<string, T>> {
  if (!alexChiefOfStaffEnabled() || getCanonicalPersonaId(ctx.agentId) !== CHIEF_OF_STAFF_ID)
    return tools;
  return withRegistryTools(tools, ctx, CHIEF_OF_STAFF_DOMAINS, 'Chief-of-staff tools');
}
