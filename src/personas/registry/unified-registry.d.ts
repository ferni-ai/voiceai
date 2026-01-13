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
/**
 * Clear agent config cache (call when config changes)
 */
export declare function clearAgentConfig(): void;
import type { LoadedPersonaBundle, PersonaBundleManifest } from '../bundles/types.js';
import type { PersonaConfig } from '../types.js';
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
/**
 * The unified agent registry.
 * Use this for all agent lookups - no more hardcoded ID lists!
 */
export declare const AgentRegistry: {
    /**
     * Get all discovered agents
     */
    getAllAgents(): Promise<Agent[]>;
    /**
     * Get all enabled agents (for team display)
     */
    getEnabledAgents(): Promise<Agent[]>;
    /**
     * Get an agent by any ID or alias
     * Returns null if not found (no fallback)
     */
    getAgentOrNull(idOrAlias: string): Promise<Agent | null>;
    /**
     * Get an agent by any ID or alias
     * Falls back to coordinator if not found
     */
    getAgent(idOrAlias: string): Promise<Agent>;
    /**
     * Get the team coordinator (Ferni)
     */
    getCoordinator(): Promise<Agent>;
    /**
     * Get all team members (excluding coordinator)
     */
    getTeamMembers(): Promise<Agent[]>;
    /**
     * Check if an ID/alias refers to a known agent
     */
    hasAgent(idOrAlias: string): Promise<boolean>;
    /**
     * Resolve any ID/alias to a canonical agent ID
     * Returns null if not found
     */
    resolveAgentId(idOrAlias: string): Promise<string | null>;
    /**
     * Check if two IDs/aliases refer to the same agent
     */
    isSameAgent(id1: string, id2: string): Promise<boolean>;
    /**
     * Get an agent's voice ID
     */
    getVoiceId(idOrAlias: string): Promise<string>;
    /**
     * Get an agent's handoff tool name
     */
    getHandoffToolName(idOrAlias: string): Promise<string>;
    /**
     * Find an agent by handoff tool name
     */
    getAgentByHandoffTool(toolName: string): Promise<Agent | null>;
    /**
     * Get all handoff triggers mapped to agent IDs
     * Useful for handoff detection
     */
    getHandoffTriggerMap(): Promise<Map<string, string[]>>;
    /**
     * Convert an agent to a PersonaConfig (for backwards compatibility)
     */
    getPersonaConfig(idOrAlias: string): Promise<PersonaConfig>;
    /**
     * Get all agents as PersonaConfig objects (for backwards compatibility)
     */
    getAllPersonaConfigs(): Promise<PersonaConfig[]>;
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
    resolveHandoffTargets(patterns: string[], excludeAgentId?: string): Promise<string[]>;
    /**
     * Find agents by domain
     * Returns agents that list the given domain in their role.domains
     */
    getAgentsByDomain(domain: string): Promise<Agent[]>;
    /**
     * Find agents by role ID
     */
    getAgentsByRole(roleId: string): Promise<Agent[]>;
    /**
     * Get the best agent for a domain (first match)
     * Useful for routing based on topic
     */
    getBestAgentForDomain(domain: string): Promise<Agent | null>;
    /**
     * Force refresh the agent cache
     * Call this after adding/removing bundles
     */
    refresh(): Promise<void>;
    /**
     * Clear the agent cache
     */
    clearCache(): void;
    /**
     * Get cache statistics
     */
    getCacheStats(): {
        agentCount: number;
        lastDiscovery: Date | null;
        cacheAge: number;
    };
};
/**
 * Get an agent by ID (shorthand for AgentRegistry.getAgent)
 */
export declare function getAgent(idOrAlias: string): Promise<Agent>;
/**
 * Get all agents (shorthand for AgentRegistry.getAllAgents)
 */
export declare function getAllAgents(): Promise<Agent[]>;
/**
 * Check if an agent exists (shorthand for AgentRegistry.hasAgent)
 */
export declare function hasAgent(idOrAlias: string): Promise<boolean>;
/**
 * Resolve an alias to canonical ID (shorthand for AgentRegistry.resolveAgentId)
 */
export declare function resolveAgentId(idOrAlias: string): Promise<string | null>;
export default AgentRegistry;
//# sourceMappingURL=unified-registry.d.ts.map