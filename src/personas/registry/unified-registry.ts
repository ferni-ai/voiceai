/**
 * Unified Agent Registry - THE SINGLE SOURCE OF TRUTH
 *
 * This module auto-discovers all agents from their bundle manifests.
 * No hardcoded agent lists - add a bundle and it's automatically registered.
 *
 * DESIGN PRINCIPLES:
 * 1. Bundle manifest is the source of truth
 * 2. Auto-discover agents from bundles directory
 * 3. Single point of access for all agent operations
 * 4. Backwards compatible with legacy ID systems
 *
 * USAGE:
 *   import { AgentRegistry } from './registry/unified-registry.js';
 *
 *   // Get all agents
 *   const agents = await AgentRegistry.getAllAgents();
 *
 *   // Get a specific agent by any ID/alias
 *   const agent = await AgentRegistry.getAgent('jack');  // or 'nayan-patel', 'sage', etc.
 *
 *   // Check if an agent exists
 *   const exists = await AgentRegistry.hasAgent('nayan-patel');
 *
 * ADDING A NEW AGENT:
 *   1. Create bundle: src/personas/bundles/my-agent/
 *   2. Add persona.manifest.json
 *   3. Done! Agent is automatically discovered.
 */

import { log } from '@livekit/agents';
import { discoverAndLoadBundles, loadBundleById, clearBundleCache } from '../bundles/index.js';
import type { LoadedPersonaBundle, PersonaBundleManifest } from '../bundles/types.js';
import type { PersonaConfig } from '../types.js';
import { bundleToPersonaConfig } from '../bundles/adapter.js';

const getLogger = () => log();

// ============================================================================
// AGENT INTERFACE - Combines manifest + runtime info
// ============================================================================

/**
 * Unified Agent interface - everything you need to know about an agent
 * This combines data from the manifest with runtime configuration
 */
export interface Agent {
  /** Canonical agent ID (from manifest) */
  readonly id: string;

  /** Display name */
  readonly name: string;

  /** Short description */
  readonly description: string;

  /** Voice configuration */
  readonly voiceId: string;
  readonly voiceProvider: 'cartesia' | 'elevenlabs' | 'openai';

  /** Role in team */
  readonly role: 'coach' | 'team' | 'standalone';
  readonly roleId: string;
  readonly roleDescription: string;

  /** Is this agent the team coordinator? */
  readonly isCoordinator: boolean;

  /** Can this agent hand off to others? */
  readonly canHandoff: boolean;
  readonly handoffTargets: string[];

  /** Handoff tool name (e.g., 'handoffToJack') */
  readonly handoffToolName: string;

  /** Keywords that trigger handoff TO this agent */
  readonly handoffTriggers: string[];

  /** All known aliases for this agent */
  readonly aliases: string[];

  /** Is this agent currently enabled? */
  readonly enabled: boolean;

  /** UI configuration */
  readonly ui: {
    initials: string;
    subtitle: string;
    themeClass: string;
    entrancePhrase?: string;
  };

  /** The raw bundle manifest */
  readonly manifest: PersonaBundleManifest;

  /** The loaded bundle (for content access) */
  readonly bundle: LoadedPersonaBundle;
}

// ============================================================================
// INTERNAL STATE
// ============================================================================

/** Cache of discovered agents */
let agentCache: Map<string, Agent> | null = null;

/** Alias lookup map (alias -> canonical ID) */
let aliasMap: Map<string, string> | null = null;

/** Last discovery timestamp */
let lastDiscoveryTime: number = 0;

/** Cache TTL in milliseconds (5 minutes in production, 10 seconds in dev) */
const CACHE_TTL_MS = process.env.NODE_ENV === 'development' ? 10_000 : 5 * 60 * 1000;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate initials from a name
 */
function getInitials(name: string): string {
  const parts = name.split(/\s+/);
  if (parts.length === 1) {
    return name.substring(0, 2).toUpperCase();
  }
  return parts
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

/**
 * Generate handoff tool name from agent ID
 */
function getHandoffToolName(id: string): string {
  // Convert 'nayan-patel' to 'handoffToJack'
  const parts = id.split('-');
  const firstName = parts[0];
  return `handoffTo${firstName.charAt(0).toUpperCase()}${firstName.slice(1)}`;
}

/**
 * Determine agent role from manifest
 */
function getAgentRole(manifest: PersonaBundleManifest): 'coach' | 'team' | 'standalone' {
  if (manifest.team?.coordinator) return 'coach';
  if (manifest.team?.membership) return 'team';
  return 'standalone';
}

/**
 * Convert a loaded bundle to an Agent object
 */
function bundleToAgent(bundle: LoadedPersonaBundle): Agent {
  const manifest = bundle.manifest;
  const identity = manifest.identity;
  const team = manifest.team;
  const voice = manifest.voice;

  const id = identity.id;
  const role = getAgentRole(manifest);

  // Build aliases list
  const aliases: string[] = [
    id,
    identity.name.toLowerCase(),
    ...(identity.aliases || []),
  ];

  // Add role-based aliases
  if (team?.role_id) {
    aliases.push(team.role_id);
  }
  if (manifest.role?.id) {
    aliases.push(manifest.role.id);
  }

  return {
    id,
    name: identity.display_name || identity.name,
    description: identity.description,

    voiceId: voice.voice_id,
    voiceProvider: voice.provider,

    role,
    roleId: team?.role_id || manifest.role?.id || id,
    roleDescription: team?.role_description || identity.description,
    isCoordinator: team?.coordinator || false,

    canHandoff: manifest.role?.can_handoff || manifest.capabilities?.can_handoff || false,
    handoffTargets: manifest.role?.handoff_targets || manifest.capabilities?.handoff_targets || [],
    handoffToolName: getHandoffToolName(id),
    handoffTriggers: team?.handoff_triggers || [],

    aliases: [...new Set(aliases.map((a) => a.toLowerCase()))],

    enabled: true, // TODO: Support enable/disable from config file

    ui: {
      initials: getInitials(identity.name),
      subtitle: team?.role_description || identity.description,
      themeClass: `persona-${id}`,
      entrancePhrase: team?.handoff_phrases?.receive?.[0],
    },

    manifest,
    bundle,
  };
}

/**
 * Build the alias lookup map
 */
function buildAliasMap(agents: Map<string, Agent>): Map<string, string> {
  const map = new Map<string, string>();

  for (const agent of agents.values()) {
    // Register all aliases
    for (const alias of agent.aliases) {
      map.set(alias.toLowerCase(), agent.id);
    }

    // Also register the canonical ID
    map.set(agent.id.toLowerCase(), agent.id);

    // Register handoff tool name -> agent ID
    map.set(agent.handoffToolName.toLowerCase(), agent.id);
  }

  return map;
}

// ============================================================================
// DISCOVERY FUNCTIONS
// ============================================================================

/**
 * Discover and load all agents from bundles
 * Results are cached for performance
 */
async function discoverAgents(forceRefresh: boolean = false): Promise<Map<string, Agent>> {
  const now = Date.now();

  // Return cached result if still valid
  if (!forceRefresh && agentCache && now - lastDiscoveryTime < CACHE_TTL_MS) {
    return agentCache;
  }

  getLogger().debug('Discovering agents from bundles...');
  const startTime = now;

  // Clear bundle cache if forcing refresh
  if (forceRefresh) {
    clearBundleCache();
  }

  // Load all bundles
  const result = await discoverAndLoadBundles();

  // Convert bundles to agents
  const agents = new Map<string, Agent>();

  for (const bundle of result.bundles) {
    try {
      const agent = bundleToAgent(bundle);
      agents.set(agent.id, agent);
    } catch (err) {
      getLogger().warn(
        { bundleId: bundle.manifest.identity.id, error: err },
        'Failed to convert bundle to agent'
      );
    }
  }

  // Build alias map
  aliasMap = buildAliasMap(agents);

  // Update cache
  agentCache = agents;
  lastDiscoveryTime = now;

  const loadTime = Date.now() - startTime;
  getLogger().info(
    { agentCount: agents.size, loadTimeMs: loadTime },
    'Agent discovery complete'
  );

  return agents;
}

// ============================================================================
// PUBLIC API - AgentRegistry
// ============================================================================

/**
 * The unified agent registry.
 * Use this for all agent lookups - no more hardcoded ID lists!
 */
export const AgentRegistry = {
  /**
   * Get all discovered agents
   */
  async getAllAgents(): Promise<Agent[]> {
    const agents = await discoverAgents();
    return Array.from(agents.values());
  },

  /**
   * Get all enabled agents (for team display)
   */
  async getEnabledAgents(): Promise<Agent[]> {
    const agents = await discoverAgents();
    return Array.from(agents.values()).filter((a) => a.enabled);
  },

  /**
   * Get an agent by any ID or alias
   * Returns null if not found (no fallback)
   */
  async getAgentOrNull(idOrAlias: string): Promise<Agent | null> {
    const agents = await discoverAgents();

    if (!aliasMap) {
      aliasMap = buildAliasMap(agents);
    }

    const normalized = idOrAlias.toLowerCase().trim();
    const canonicalId = aliasMap.get(normalized);

    if (!canonicalId) {
      return null;
    }

    return agents.get(canonicalId) || null;
  },

  /**
   * Get an agent by any ID or alias
   * Falls back to coordinator if not found
   */
  async getAgent(idOrAlias: string): Promise<Agent> {
    const agent = await this.getAgentOrNull(idOrAlias);

    if (agent) {
      return agent;
    }

    // Fall back to coordinator
    getLogger().warn({ idOrAlias }, 'Unknown agent, falling back to coordinator');
    const coordinator = await this.getCoordinator();
    return coordinator;
  },

  /**
   * Get the team coordinator (Ferni)
   */
  async getCoordinator(): Promise<Agent> {
    const agents = await discoverAgents();

    // Find coordinator
    for (const agent of agents.values()) {
      if (agent.isCoordinator) {
        return agent;
      }
    }

    // Fallback: return first agent
    const firstAgent = agents.values().next().value;
    if (firstAgent) {
      getLogger().warn('No coordinator found, using first agent');
      return firstAgent;
    }

    throw new Error('No agents discovered - cannot get coordinator');
  },

  /**
   * Get all team members (excluding coordinator)
   */
  async getTeamMembers(): Promise<Agent[]> {
    const agents = await discoverAgents();
    return Array.from(agents.values()).filter((a) => a.role === 'team' && a.enabled);
  },

  /**
   * Check if an ID/alias refers to a known agent
   */
  async hasAgent(idOrAlias: string): Promise<boolean> {
    const agent = await this.getAgentOrNull(idOrAlias);
    return agent !== null;
  },

  /**
   * Resolve any ID/alias to a canonical agent ID
   * Returns null if not found
   */
  async resolveAgentId(idOrAlias: string): Promise<string | null> {
    await discoverAgents(); // Ensure alias map is built

    if (!aliasMap) return null;

    const normalized = idOrAlias.toLowerCase().trim();
    return aliasMap.get(normalized) || null;
  },

  /**
   * Check if two IDs/aliases refer to the same agent
   */
  async isSameAgent(id1: string, id2: string): Promise<boolean> {
    const resolved1 = await this.resolveAgentId(id1);
    const resolved2 = await this.resolveAgentId(id2);
    return resolved1 !== null && resolved1 === resolved2;
  },

  /**
   * Get an agent's voice ID
   */
  async getVoiceId(idOrAlias: string): Promise<string> {
    const agent = await this.getAgent(idOrAlias);
    return agent.voiceId;
  },

  /**
   * Get an agent's handoff tool name
   */
  async getHandoffToolName(idOrAlias: string): Promise<string> {
    const agent = await this.getAgent(idOrAlias);
    return agent.handoffToolName;
  },

  /**
   * Find an agent by handoff tool name
   */
  async getAgentByHandoffTool(toolName: string): Promise<Agent | null> {
    const agents = await discoverAgents();

    for (const agent of agents.values()) {
      if (agent.handoffToolName.toLowerCase() === toolName.toLowerCase()) {
        return agent;
      }
    }

    return null;
  },

  /**
   * Get all handoff triggers mapped to agent IDs
   * Useful for handoff detection
   */
  async getHandoffTriggerMap(): Promise<Map<string, string[]>> {
    const agents = await discoverAgents();
    const triggerMap = new Map<string, string[]>();

    for (const agent of agents.values()) {
      if (agent.handoffTriggers.length > 0) {
        triggerMap.set(agent.id, agent.handoffTriggers);
      }
    }

    return triggerMap;
  },

  /**
   * Convert an agent to a PersonaConfig (for backwards compatibility)
   */
  async getPersonaConfig(idOrAlias: string): Promise<PersonaConfig> {
    const agent = await this.getAgent(idOrAlias);
    return bundleToPersonaConfig(agent.bundle);
  },

  /**
   * Get all agents as PersonaConfig objects (for backwards compatibility)
   */
  async getAllPersonaConfigs(): Promise<PersonaConfig[]> {
    const agents = await this.getAllAgents();
    const configs: PersonaConfig[] = [];

    for (const agent of agents) {
      try {
        const config = await bundleToPersonaConfig(agent.bundle);
        configs.push(config);
      } catch (err) {
        getLogger().warn({ agentId: agent.id, error: err }, 'Failed to convert agent to PersonaConfig');
      }
    }

    return configs;
  },

  /**
   * Resolve handoff target patterns to actual agent IDs
   * 
   * Supported patterns:
   * - `@coordinator` - The team coordinator
   * - `@team` - All active team members (excluding coordinator)
   * - `*` - All available agents
   * - `@role:<role-id>` - Agents with specific role
   * - `@domain:<domain>` - Agents handling specific domain
   * - `<agent-id>` - Specific agent ID (passed through)
   * 
   * @param patterns Array of patterns or agent IDs from manifest
   * @param excludeAgentId Optional agent to exclude (e.g., current agent)
   * @returns Array of resolved canonical agent IDs
   */
  async resolveHandoffTargets(patterns: string[], excludeAgentId?: string): Promise<string[]> {
    const agents = await discoverAgents();
    const resolved = new Set<string>();

    for (const pattern of patterns) {
      const trimmed = pattern.trim().toLowerCase();

      if (trimmed === '*') {
        // All agents
        for (const agent of agents.values()) {
          if (agent.enabled) resolved.add(agent.id);
        }
      } else if (trimmed === '@coordinator') {
        // Coordinator only
        for (const agent of agents.values()) {
          if (agent.isCoordinator && agent.enabled) {
            resolved.add(agent.id);
          }
        }
      } else if (trimmed === '@team') {
        // All team members (excluding coordinator)
        for (const agent of agents.values()) {
          if (agent.role === 'team' && agent.enabled && !agent.isCoordinator) {
            resolved.add(agent.id);
          }
        }
      } else if (trimmed.startsWith('@role:')) {
        // Specific role
        const roleId = trimmed.slice(6);
        for (const agent of agents.values()) {
          if (agent.roleId.toLowerCase() === roleId && agent.enabled) {
            resolved.add(agent.id);
          }
        }
      } else if (trimmed.startsWith('@domain:')) {
        // Specific domain
        const domain = trimmed.slice(8);
        for (const agent of agents.values()) {
          const domains = agent.manifest.role?.domains || [];
          if (domains.some(d => d.toLowerCase() === domain) && agent.enabled) {
            resolved.add(agent.id);
          }
        }
      } else {
        // Assume it's a specific agent ID - resolve it
        const canonicalId = await this.resolveAgentId(pattern);
        if (canonicalId) {
          const agent = agents.get(canonicalId);
          if (agent?.enabled) {
            resolved.add(canonicalId);
          }
        }
      }
    }

    // Exclude specified agent
    if (excludeAgentId) {
      resolved.delete(excludeAgentId);
    }

    return Array.from(resolved);
  },

  /**
   * Find agents by domain
   * Returns agents that list the given domain in their role.domains
   */
  async getAgentsByDomain(domain: string): Promise<Agent[]> {
    const agents = await discoverAgents();
    const domainLower = domain.toLowerCase();

    return Array.from(agents.values()).filter(agent => {
      const domains = agent.manifest.role?.domains || [];
      return domains.some(d => d.toLowerCase() === domainLower) && agent.enabled;
    });
  },

  /**
   * Find agents by role ID
   */
  async getAgentsByRole(roleId: string): Promise<Agent[]> {
    const agents = await discoverAgents();
    const roleLower = roleId.toLowerCase();

    return Array.from(agents.values()).filter(
      agent => agent.roleId.toLowerCase() === roleLower && agent.enabled
    );
  },

  /**
   * Get the best agent for a domain (first match)
   * Useful for routing based on topic
   */
  async getBestAgentForDomain(domain: string): Promise<Agent | null> {
    const agents = await this.getAgentsByDomain(domain);
    return agents[0] || null;
  },

  /**
   * Force refresh the agent cache
   * Call this after adding/removing bundles
   */
  async refresh(): Promise<void> {
    await discoverAgents(true);
  },

  /**
   * Clear the agent cache
   */
  clearCache(): void {
    agentCache = null;
    aliasMap = null;
    lastDiscoveryTime = 0;
    clearBundleCache();
  },

  /**
   * Get cache statistics
   */
  getCacheStats(): { agentCount: number; lastDiscovery: Date | null; cacheAge: number } {
    return {
      agentCount: agentCache?.size || 0,
      lastDiscovery: lastDiscoveryTime > 0 ? new Date(lastDiscoveryTime) : null,
      cacheAge: lastDiscoveryTime > 0 ? Date.now() - lastDiscoveryTime : -1,
    };
  },
};

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

/**
 * Get an agent by ID (shorthand for AgentRegistry.getAgent)
 */
export async function getAgent(idOrAlias: string): Promise<Agent> {
  return AgentRegistry.getAgent(idOrAlias);
}

/**
 * Get all agents (shorthand for AgentRegistry.getAllAgents)
 */
export async function getAllAgents(): Promise<Agent[]> {
  return AgentRegistry.getAllAgents();
}

/**
 * Check if an agent exists (shorthand for AgentRegistry.hasAgent)
 */
export async function hasAgent(idOrAlias: string): Promise<boolean> {
  return AgentRegistry.hasAgent(idOrAlias);
}

/**
 * Resolve an alias to canonical ID (shorthand for AgentRegistry.resolveAgentId)
 */
export async function resolveAgentId(idOrAlias: string): Promise<string | null> {
  return AgentRegistry.resolveAgentId(idOrAlias);
}

// Default export
export default AgentRegistry;

