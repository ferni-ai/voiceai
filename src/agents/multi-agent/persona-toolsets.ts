/**
 * PERSONA_TOOLSETS: each persona's agent gets one fixed set of 40 tools or
 * fewer, built when the agent is created; a handoff builds the next persona's.
 *
 * Today the first agent's ~140 essential-domain tools are cut to 64 by a
 * priority list, and keyword topics then grow the menu to a median of 96 per
 * turn. On the tool-choice harness, 40 tools beat 96 by 2.6-3.3 points, nearly
 * all from fewer lookalike calls (scripts/tool-retrieval/RESULTS.md, Phase 0;
 * "SOTA tool routing for voice agents", Phase 1).
 *
 * The set, in request order (pickSpecialistSet, specialist-tools.ts):
 * 1. PERSONA_CORE_TOOLS, the same on every persona: the safety set first, then
 *    memory and privacy, the everyday basics every teammate is told it has,
 *    web search and on-behalf calls. Never trimmed.
 * 2. endCall and the call journal tools when the call has them, and the
 *    session's teammate tools: one handoff per teammate, askForTeammate,
 *    introduceMember, meetTheTeam. Never trimmed.
 * 3. The persona's beat, then head tools (persona-toolset-picks.ts), trimmed
 *    from the end to fit 38, so findTools and endCall appended past the cap
 *    (agent-setup.ts) still leave 40 or fewer.
 *
 * With the flag on it replaces SPECIALIST_TOOLS, the lean TOOLS_SAME_TURN set,
 * MENU_TOOLS_PINNED and ALEX_CHIEF_OF_STAFF's additions (everyday-basics.ts).
 * TOOL_CORE_STATIC, when also on, still replaces every set with its static core.
 * Mid-call offers add nothing (agents/shared/tool-updater.ts). TOOLS_SAME_TURN's
 * per-request topic tools (up to 8, agents/personas/same-turn-tools.ts) still
 * reach the one request that names a topic, for the cohorts it is on for: they
 * never join the agent's set.
 *
 * @module agents/multi-agent/persona-toolsets
 */
import { PRIVACY_TOOLS } from '../../config/privacy-tools.js';
import { LEAN_ALWAYS_ON_TOOLS } from '../../config/same-turn-tools-config.js';
import { getCanonicalPersonaId } from '../../personas/voice-registry.js';
import { withTeammateTool } from '../../tools/handoff/locked-teammates.js';
import type { ToolContext, ToolDomain } from '../../tools/registry/index.js';
import { createLogger } from '../../utils/safe-logger.js';
import {
  FERNI_HEAD_DOMAINS,
  PERSONA_TOOL_PICKS,
  type PersonaToolPicks,
} from './persona-toolset-picks.js';
import { withRegistryTools } from './registry-tools.js';
import { SPECIALIST_CORE_TOOLS, SPECIALIST_TOOL_SETS } from './specialist-tool-sets.js';
import { ADDED_AFTER_CAP, pickSpecialistSet } from './specialist-tools.js';

const log = createLogger({ module: 'persona-toolsets' });

/** The most tools a persona's agent is offered, findTools and endCall included. */
export const PERSONA_TOOLSET_MAX = 40;

const SAFETY_DOMAINS: readonly string[] = [
  'crisis',
  'human-transfer',
  'trauma-support',
  'presence',
];

/**
 * The safety set: crisis, human transfer, grounding and trauma support, as
 * every essential list holds it (DEFAULT_ESSENTIAL_TOOLS and STATIC_CORE_TOOLS
 * in tool-config.ts, SPECIALIST_CORE_TOOLS, LEAN_ALWAYS_ON_TOOLS; the test
 * holds them equal). The same on every persona and never trimmed. Changing it
 * is a crisis-lane change that Seth signs.
 */
export const SAFETY_TOOLS: readonly string[] = Object.keys(SPECIALIST_CORE_TOOLS).filter((name) =>
  SAFETY_DOMAINS.includes(SPECIALIST_CORE_TOOLS[name])
);

/** Lookalikes of rememberAboutUser and recallFromMemory, which prod calls instead. */
const MEMORY_LOOKALIKES = [
  'recallPreviousConversation',
  'rememberImportantFact',
  'surfaceRelevantMemory',
];

/** The shared core: the specialist core without the memory lookalikes, plus these four. */
export const PERSONA_CORE_TOOLS: readonly string[] = [
  ...Object.keys(SPECIALIST_CORE_TOOLS).filter((name) => !MEMORY_LOOKALIKES.includes(name)),
  ...PRIVACY_TOOLS,
  'searchWeb',
  'callOnBehalf',
];

/** This agent's beat and head tools; Ferni's for a persona without its own. */
export function toolPicksFor(agentId: string): PersonaToolPicks {
  return PERSONA_TOOL_PICKS[getCanonicalPersonaId(agentId)] ?? PERSONA_TOOL_PICKS.ferni;
}

/** The registry domain of each of `names`, from the lists that already name it. */
export function toolDomains(names: readonly string[], agentId: string): Record<string, ToolDomain> {
  const known: Readonly<Record<string, string>> = {
    ...LEAN_ALWAYS_ON_TOOLS,
    ...SPECIALIST_CORE_TOOLS,
    ...FERNI_HEAD_DOMAINS,
    ...SPECIALIST_TOOL_SETS[getCanonicalPersonaId(agentId)],
  };
  return Object.fromEntries(
    names.filter((name) => name in known).map((name) => [name, known[name] as ToolDomain])
  );
}

/**
 * `tools` cut to this agent's persona set (only tools `tools` holds). It holds
 * askForTeammate, which the agent would add anyway (ferni-agent.ts), so the
 * count is what the agent is offered.
 */
export function personaToolset<T>(tools: Record<string, T>, agentId: string): Record<string, T> {
  const { beat, head } = toolPicksFor(agentId);
  const limit = PERSONA_TOOLSET_MAX - ADDED_AFTER_CAP;
  return pickSpecialistSet(withTeammateTool(tools), [...beat, ...head], limit, PERSONA_CORE_TOOLS);
}

/** The agent's persona set: the tools `tools` lacks are built from the registry first. */
export async function withPersonaToolset<T>(
  tools: Record<string, T>,
  ctx: ToolContext
): Promise<Record<string, T>> {
  const { beat, head } = toolPicksFor(ctx.agentId);
  const wanted = [...PERSONA_CORE_TOOLS, ...beat, ...head];
  const all = await withRegistryTools(
    tools,
    ctx,
    toolDomains(wanted, ctx.agentId),
    'Persona toolset'
  );
  const set = personaToolset(all, ctx.agentId);
  const unavailable = wanted.filter((name) => !(name in set));
  log.info(
    { agentId: ctx.agentId, count: Object.keys(set).length, unavailable },
    'PERSONA_TOOLSETS set'
  );
  return set;
}
