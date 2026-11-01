/**
 * A specialist's tool set while SPECIALIST_TOOLS is on (specialist-tool-sets.ts).
 *
 * Runs last in withAlwaysOnTools, so on every path agent-setup.ts takes
 * (handoff essential set, gateway Tier 0, first agent, fallback) the set the
 * cap sees is already this one. It stays under specialistToolLimit(), so the
 * cap drops nothing and the specialty tools survive; Ferni's set is untouched.
 * TOOL_CORE_STATIC replaces every set with its static core, this one included.
 *
 * @module agents/multi-agent/specialist-tools
 */
import { getMaxTools, isTeammateTool } from '../../config/tool-config.js';
import { getCanonicalPersonaId } from '../../personas/voice-registry.js';
import type { ToolContext, ToolDomain } from '../../tools/registry/types.js';
import { createLogger } from '../../utils/safe-logger.js';
import { DEFAULT_INITIAL_TOOL_LIMIT, resolveInitialToolLimit } from './initial-tools.js';
import { withRegistryTools } from './registry-tools.js';
import {
  SPECIALIST_CORE_TOOLS,
  SPECIALIST_KEEP_IF_PRESENT,
  SPECIALIST_TOOL_SETS,
  specialistToolsEnabled,
} from './specialist-tool-sets.js';

const log = createLogger({ module: 'specialist-tools' });

/** agent-setup.ts adds findTools (live retrieval) and endCall (on-behalf calls) after the cap. */
export const ADDED_AFTER_CAP = 2;

/** The most tools a specialist's set may hold, so the final set stays within 64. */
export function specialistToolLimit(): number {
  const cap = Math.min(resolveInitialToolLimit(getMaxTools()), DEFAULT_INITIAL_TOOL_LIMIT);
  return cap - ADDED_AFTER_CAP;
}

/** This agent's specialty tools and their domains, when the flag is on and it has a list. */
export function specialtyFor(agentId: string): Readonly<Record<string, ToolDomain>> | null {
  if (!specialistToolsEnabled()) return null;
  return SPECIALIST_TOOL_SETS[getCanonicalPersonaId(agentId)] ?? null;
}

/**
 * From `tools`, in this order: the `core` tools, the always-kept tools and the
 * teammate tools (handoffs, askForTeammate), then `specialty`, all within
 * `limit`. Only specialty tools are ever dropped for room, from the end.
 * PERSONA_TOOLSETS passes its own core (persona-toolsets.ts).
 */
export function pickSpecialistSet<T>(
  tools: Record<string, T>,
  specialty: readonly string[],
  limit: number,
  core: readonly string[] = Object.keys(SPECIALIST_CORE_TOOLS)
): Record<string, T> {
  const kept: Record<string, T> = {};
  const keep = (name: string): void => {
    if (name in tools && !(name in kept)) kept[name] = tools[name];
  };
  core.forEach(keep);
  SPECIALIST_KEEP_IF_PRESENT.forEach(keep);
  Object.keys(tools).filter(isTeammateTool).forEach(keep);
  const dropped: string[] = [];
  for (const name of specialty) {
    if (Object.keys(kept).length < limit) keep(name);
    else if (name in tools && !(name in kept)) dropped.push(name);
  }
  if (dropped.length > 0) log.warn({ dropped, limit }, 'Specialist tools over the cap');
  return kept;
}

/**
 * `tools` reduced to this specialist's set, with any core or specialty tool it
 * lacks built from the registry; `tools` unchanged for Ferni, for a persona
 * without a list, or with the flag off.
 */
export async function withSpecialistTools<T>(
  tools: Record<string, T>,
  ctx: ToolContext
): Promise<Record<string, T>> {
  const specialty = specialtyFor(ctx.agentId);
  if (!specialty) return tools;
  const byName = { ...SPECIALIST_CORE_TOOLS, ...specialty };
  const all = await withRegistryTools(tools, ctx, byName, 'Specialist tools');
  return pickSpecialistSet(all, Object.keys(specialty), specialistToolLimit());
}
