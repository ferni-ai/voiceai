/**
 * Agent Registry - DEPRECATED
 *
 * @deprecated This module is deprecated. Use the unified registry instead:
 *
 *   import { AgentRegistry } from './registry/unified-registry.js';
 *
 * The unified registry:
 * - Auto-discovers agents from bundles (no hardcoding)
 * - Single source of truth for all agent lookups
 * - Dynamic handoff tool generation
 *
 * Migration guide: See docs/AGENT-MANAGEMENT.md
 *
 * This file is kept for backwards compatibility and will be removed in a future version.
 */

// Log deprecation warning on first import
console.warn(
  '⚠️ DEPRECATED: agent-registry.ts is deprecated. ' +
  'Use AgentRegistry from registry/unified-registry.js instead.'
);

// ============================================================================
// AGENT IDS - Simple, semantic identifiers
// ============================================================================

/**
 * All valid agent IDs.
 * These are the ONLY IDs used internally throughout the codebase.
 *
 * To add a new agent:
 * 1. Add the ID here
 * 2. Add the config in AGENT_CONFIGS below
 * 3. Create the bundle in /src/personas/bundles/{id}/
 */
export const AGENT_IDS = {
  // Core team
  COACH: 'coach',           // Ferni - Life coach, orchestrator
  RESEARCHER: 'researcher', // Peter John - Stock research
  COMM: 'comm',             // Alex - Communication
  BUDGET: 'budget',         // Maya - Spending & saving
  PLANNER: 'planner',       // Jordan - Life planning

  // Future agents can be added here:
  // ANALYST: 'analyst',
  // MENTOR: 'mentor',
} as const;

export type AgentId = (typeof AGENT_IDS)[keyof typeof AGENT_IDS];

/**
 * All agent IDs as an array
 */
export const ALL_AGENT_IDS: readonly AgentId[] = Object.values(AGENT_IDS);

// ============================================================================
// AGENT CONFIGURATION - One entry per agent
// ============================================================================

export interface AgentConfig {
  /** The agent's display name (user-facing) */
  displayName: string;
  /** Short description */
  description: string;
  /** Voice ID for TTS */
  voiceId: string;
  /** Bundle ID (folder name in /bundles/) */
  bundleId: string;
  /** Frontend persona ID (for backwards compatibility) */
  frontendId: string;
  /** Role: coach or team member */
  role: 'coach' | 'team';
  /** Legacy aliases (for migration) */
  aliases: string[];
}

/**
 * Agent configurations.
 * This is the ONLY place agent metadata is defined.
 */
export const AGENT_CONFIGS: Record<AgentId, AgentConfig> = {
  coach: {
    displayName: 'Ferni',
    description: 'Life coach and team orchestrator',
    voiceId: 'f114a467-c40a-4db8-964d-aaba89cd08fa', // Warm, friendly
    bundleId: 'ferni',
    frontendId: 'jack-b',
    role: 'coach',
    aliases: ['ferni', 'jack-b', 'life-coach', 'jackie'],
  },
  researcher: {
    displayName: 'Peter',
    description: 'Stock research enthusiast',
    voiceId: 'db832ebd-3cb6-42e7-9d47-912b425adbaa', // Energetic, animated
    bundleId: 'peter-john',
    frontendId: 'peter-john',
    role: 'team',
    aliases: ['peter-john', 'peter', 'john', 'stock-storyteller'],
  },
  comm: {
    displayName: 'Alex',
    description: 'Communication specialist',
    voiceId: '2ee87190-8f84-4925-97da-e52547f9462c', // Professional, efficient
    bundleId: 'alex-chen',
    frontendId: 'comm-specialist',
    role: 'team',
    aliases: ['alex-chen', 'alex', 'comm-specialist', 'communicator'],
  },
  budget: {
    displayName: 'Maya',
    description: 'Spending and saving expert',
    voiceId: 'c45bc5ec-dc68-4feb-8829-6e6b2748095d', // Warm, supportive
    bundleId: 'maya-santos',
    frontendId: 'spend-save',
    role: 'team',
    aliases: ['maya-santos', 'maya', 'spend-save', 'habits-coach'],
  },
  planner: {
    displayName: 'Jordan',
    description: "Life's firsts coordinator",
    voiceId: '21b81c14-f85b-436d-aeff-02f77767e9a4', // Enthusiastic, organized
    bundleId: 'jordan-taylor',
    frontendId: 'event-planner',
    role: 'team',
    aliases: ['jordan-taylor', 'jordan', 'event-planner', 'events'],
  },
};

// ============================================================================
// ALIAS RESOLUTION
// ============================================================================

// Build alias map at module load
const aliasMap = new Map<string, AgentId>();
for (const [agentId, config] of Object.entries(AGENT_CONFIGS)) {
  // Register the agent ID itself
  aliasMap.set(agentId, agentId as AgentId);

  // Register all aliases
  for (const alias of config.aliases) {
    aliasMap.set(alias.toLowerCase(), agentId as AgentId);
  }

  // Register bundle ID
  aliasMap.set(config.bundleId.toLowerCase(), agentId as AgentId);

  // Register frontend ID
  aliasMap.set(config.frontendId.toLowerCase(), agentId as AgentId);
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Resolve ANY string to an agent ID.
 * This is the ONLY function that should be used for ID resolution.
 *
 * @param input - Any agent ID, alias, bundle ID, or frontend ID
 * @returns The canonical agent ID
 */
export function resolveAgentId(input: string): AgentId {
  const normalized = input.toLowerCase().trim();
  const agentId = aliasMap.get(normalized);

  if (!agentId) {
    console.warn(`⚠️ Unknown agent identifier "${input}", defaulting to coach`);
    return AGENT_IDS.COACH;
  }

  return agentId;
}

/**
 * Get agent configuration by ID.
 */
export function getAgentConfig(agentId: AgentId): AgentConfig {
  return AGENT_CONFIGS[agentId];
}

/**
 * Get display name for an agent.
 */
export function getDisplayName(input: string): string {
  const agentId = resolveAgentId(input);
  return AGENT_CONFIGS[agentId].displayName;
}

/**
 * Get voice ID for an agent.
 */
export function getVoiceIdForAgent(input: string): string {
  const agentId = resolveAgentId(input);
  return AGENT_CONFIGS[agentId].voiceId;
}

/**
 * Get bundle ID for an agent.
 */
export function getBundleId(input: string): string {
  const agentId = resolveAgentId(input);
  return AGENT_CONFIGS[agentId].bundleId;
}

/**
 * Get frontend ID for an agent (backwards compatibility).
 */
export function getFrontendId(input: string): string {
  const agentId = resolveAgentId(input);
  return AGENT_CONFIGS[agentId].frontendId;
}

/**
 * Check if an input resolves to a valid agent.
 */
export function isValidAgent(input: string): boolean {
  const normalized = input.toLowerCase().trim();
  return aliasMap.has(normalized);
}

/**
 * Check if two inputs refer to the same agent.
 */
export function isSameAgent(input1: string, input2: string): boolean {
  return resolveAgentId(input1) === resolveAgentId(input2);
}

/**
 * Check if an agent is the coach.
 */
export function isCoach(input: string): boolean {
  return resolveAgentId(input) === AGENT_IDS.COACH;
}

/**
 * Check if an agent is a team member (not coach).
 */
export function isTeamMember(input: string): boolean {
  const agentId = resolveAgentId(input);
  return AGENT_CONFIGS[agentId].role === 'team';
}

/**
 * Get all team member IDs.
 */
export function getTeamMemberIds(): AgentId[] {
  return ALL_AGENT_IDS.filter((id) => AGENT_CONFIGS[id].role === 'team');
}

/**
 * Get agent by role.
 */
export function getAgentByRole(role: 'coach' | 'team'): AgentId[] {
  return ALL_AGENT_IDS.filter((id) => AGENT_CONFIGS[id].role === role);
}

// ============================================================================
// HANDOFF HELPERS
// ============================================================================

/**
 * Get the handoff tool name for an agent.
 */
export function getHandoffToolName(input: string): string {
  const agentId = resolveAgentId(input);
  const toolNames: Record<AgentId, string> = {
    coach: 'handoffToCoach',
    researcher: 'handoffToResearcher',
    comm: 'handoffToComm',
    budget: 'handoffToBudget',
    planner: 'handoffToPlanner',
  };
  return toolNames[agentId];
}

/**
 * Build the mapping from any ID to handoff tool.
 * Use this in voice-agent.ts for UI-triggered handoffs.
 */
export function buildHandoffToolMap(): Map<string, string> {
  const map = new Map<string, string>();

  for (const [alias, agentId] of aliasMap.entries()) {
    map.set(alias, getHandoffToolName(agentId));
  }

  return map;
}

// ============================================================================
// DEBUG / DEVELOPMENT
// ============================================================================

/**
 * Log all registered aliases (for debugging).
 */
export function debugAliases(): void {
  console.log('=== Agent Registry Aliases ===');
  for (const agentId of ALL_AGENT_IDS) {
    const config = AGENT_CONFIGS[agentId];
    const aliases = config.aliases.join(', ');
    console.log(`${agentId} (${config.displayName}): ${aliases}`);
  }
}

/**
 * Validate registry consistency.
 */
export function validateRegistry(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check all agent IDs have configs
  for (const id of ALL_AGENT_IDS) {
    if (!AGENT_CONFIGS[id]) {
      errors.push(`Missing config for agent ID: ${id}`);
    }
  }

  // Check for duplicate aliases
  const seenAliases = new Set<string>();
  for (const [agentId, config] of Object.entries(AGENT_CONFIGS)) {
    for (const alias of config.aliases) {
      const normalized = alias.toLowerCase();
      if (seenAliases.has(normalized)) {
        errors.push(`Duplicate alias "${alias}" in agent ${agentId}`);
      }
      seenAliases.add(normalized);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  AGENT_IDS,
  ALL_AGENT_IDS,
  AGENT_CONFIGS,
  resolveAgentId,
  getAgentConfig,
  getDisplayName,
  getVoiceIdForAgent,
  getBundleId,
  getFrontendId,
  isValidAgent,
  isSameAgent,
  isCoach,
  isTeamMember,
  getTeamMemberIds,
  getHandoffToolName,
  buildHandoffToolMap,
  validateRegistry,
};

