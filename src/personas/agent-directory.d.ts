/**
 * Agent Directory - Single Source of Truth for Agent Data
 *
 * This module provides a unified interface for all agent-related lookups.
 * It wraps AgentRegistry and adds UI/transition configuration.
 *
 * DESIGN PRINCIPLES:
 * 1. ALL agent data comes from manifests via AgentRegistry
 * 2. NO hardcoded agent IDs or names
 * 3. Transition styles, emojis, and sounds are derived from manifest data
 * 4. Single function for ID normalization
 *
 * USAGE:
 *   import { AgentDirectory, normalizeAgentId } from './agent-directory.js';
 *
 *   // Normalize any ID format
 *   const id = normalizeAgentId('jack'); // Returns 'ferni'
 *
 *   // Get agent with all display data
 *   const entry = await AgentDirectory.getEntry('peter-john');
 *   console.log(entry.emoji); // '📈'
 *   console.log(entry.transitionStyle); // 'dramatic'
 */
import { type Agent } from './registry/unified-registry.js';
/**
 * Transition style for handoff animations
 * - 'standard': Default team transitions
 * - 'dramatic': Theatrical entrances (e.g., Peter John)
 * - 'subtle': Quiet transitions (e.g., Nayan)
 * - 'warm': Welcoming transitions (e.g., returning to coach)
 */
export type TransitionStyle = 'standard' | 'dramatic' | 'subtle' | 'warm';
/**
 * Extended agent entry with UI and transition data
 */
export interface AgentDirectoryEntry {
    /** Canonical agent ID */
    readonly id: string;
    /** Display name */
    readonly name: string;
    /** Short display name (first name only) */
    readonly displayName: string;
    /** Agent role */
    readonly role: 'coach' | 'team' | 'standalone';
    /** Whether this is the coordinator */
    readonly isCoordinator: boolean;
    /** All known aliases for this agent */
    readonly aliases: readonly string[];
    /** Emoji for this agent (derived from role/specialties) */
    readonly emoji: string;
    /** Short specialty description */
    readonly specialty: string;
    /** Transition style for handoff animations */
    readonly transitionStyle: TransitionStyle;
    /** Handoff sound file name (without path) */
    readonly handoffSound: string;
    /** Delay multiplier for transitions (1.0 = standard) */
    readonly delayMultiplier: number;
    /** Original Agent object from registry */
    readonly agent: Agent;
}
/**
 * Handoff direction based on agent roles
 */
export type HandoffDirection = 'coach-to-team' | 'team-to-coach' | 'team-to-team' | 'dramatic-entrance' | 'subtle-transition';
/**
 * Normalize any agent ID to canonical form.
 *
 * This is THE SINGLE function for ID normalization.
 * Do not create other normalization functions elsewhere!
 *
 * @param input - Any agent ID, alias, or name
 * @returns Canonical agent ID, or 'ferni' if not found
 */
export declare function normalizeAgentId(input: string): Promise<string>;
/**
 * Synchronous ID normalization (uses cached data)
 * Call ensureCache() first if needed, or use async version
 */
export declare function normalizeAgentIdSync(input: string): string;
/**
 * Agent Directory - unified access to agent data
 */
export declare const AgentDirectory: {
    /**
     * Get an agent entry by ID or alias
     */
    getEntry(idOrAlias: string): Promise<AgentDirectoryEntry | null>;
    /**
     * Get an agent entry, falling back to coordinator if not found
     */
    getEntryOrCoordinator(idOrAlias: string): Promise<AgentDirectoryEntry>;
    /**
     * Get all agent entries
     */
    getAllEntries(): Promise<AgentDirectoryEntry[]>;
    /**
     * Get the coordinator entry
     */
    getCoordinator(): Promise<AgentDirectoryEntry>;
    /**
     * Get all team members (excluding coordinator)
     */
    getTeamMembers(): Promise<AgentDirectoryEntry[]>;
    /**
     * Check if two IDs refer to the same agent
     */
    isSameAgent(id1: string, id2: string): Promise<boolean>;
    /**
     * Determine handoff direction based on agent roles
     */
    getHandoffDirection(fromId: string, toId: string): Promise<HandoffDirection>;
    /**
     * Get display name for an agent
     */
    getDisplayName(idOrAlias: string): Promise<string>;
    /**
     * Get emoji for an agent
     */
    getEmoji(idOrAlias: string): Promise<string>;
    /**
     * Get handoff sound for an agent
     */
    getHandoffSound(idOrAlias: string): Promise<string>;
    /**
     * Get team members for handoff display
     */
    getTeamForHandoff(): Promise<Array<{
        id: string;
        name: string;
        specialty: string;
        emoji: string;
    }>>;
    /**
     * Initialize the cache (call at startup)
     */
    initialize(): Promise<void>;
    /**
     * Clear the cache (call when agents change)
     */
    clearCache(): void;
    /**
     * Get LLM context instructions for an agent (for handoff identity reminders)
     * Reads from manifest.llm_context
     */
    getLLMContext(idOrAlias: string): Promise<string>;
};
export default AgentDirectory;
//# sourceMappingURL=agent-directory.d.ts.map