/**
 * Handoff Factory - Dynamic Handoff Tool Generation
 *
 * Automatically generates handoff tools based on discovered agents.
 * No more hardcoded handoff tool definitions!
 *
 * USAGE:
 *   const { tools } = await buildHandoffTools();
 *   // tools is a Record<string, Tool> ready for the LLM
 *
 * HOW IT WORKS:
 *   1. Discovers all agents from bundles/registry
 *   2. Generates a handoff tool for each non-coordinator agent
 *   3. Each tool uses the generic executeHandoff() function
 *   4. Tools are cached and refreshed when agents change
 *
 * ADDING A NEW AGENT:
 *   1. Create the bundle in src/personas/bundles/my-agent/
 *   2. Restart the server
 *   3. Handoff tool is automatically available!
 */
import { z } from 'zod';
import { type Agent } from '../../personas/registry/unified-registry.js';
import type { UserProfile } from '../../types/user-profile.js';
/**
 * A generated handoff tool definition
 */
export interface HandoffToolDefinition {
    name: string;
    description: string;
    parameters: z.ZodTypeAny;
    agentId: string;
    agentName: string;
    handoffTriggers: string[];
}
/**
 * All generated handoff tools
 */
export interface HandoffToolSet {
    tools: HandoffToolDefinition[];
    toolsByName: Map<string, HandoffToolDefinition>;
    toolsByAgentId: Map<string, HandoffToolDefinition>;
    coordinatorId: string;
    generatedAt: Date;
}
/**
 * Create handoff tools for all discovered agents.
 * Results are cached for performance.
 *
 * @param currentAgentId - ID of the current agent (to exclude from tools)
 * @returns HandoffToolSet with all generated tools
 */
export declare function createHandoffTools(currentAgentId?: string): Promise<HandoffToolSet>;
/**
 * Get a specific handoff tool by name
 */
export declare function getHandoffTool(toolName: string): Promise<HandoffToolDefinition | null>;
/**
 * Get the handoff tool for a specific agent
 */
export declare function getHandoffToolForAgent(agentId: string): Promise<HandoffToolDefinition | null>;
/**
 * Find which agent a handoff request is targeting based on trigger keywords
 */
export declare function findHandoffTarget(userMessage: string): Promise<Agent | null>;
/**
 * Get tool names for a Zod enum (useful for LLM function calling)
 */
export declare function getHandoffToolNames(currentAgentId?: string): Promise<string[]>;
/**
 * Clear the handoff tool cache
 * Call this when agents are added/removed
 */
export declare function clearHandoffToolCache(): void;
/**
 * Check if a tool name is a handoff tool
 */
export declare function isHandoffToolName(toolName: string): boolean;
/**
 * Extract agent name from handoff tool name
 * e.g., 'handoffToJack' -> 'Jack'
 */
export declare function getAgentNameFromToolName(toolName: string): string | null;
/**
 * Options for building handoff tools
 */
export interface BuildHandoffToolsOptions {
    /** Current agent to exclude from available handoffs */
    currentAgentId?: string;
    /** User profile for unlock validation (fallback if runtime context unavailable) */
    userProfile?: UserProfile | null;
    /** User's subscription tier (fallback if runtime context unavailable) */
    subscriptionTier?: 'free' | 'friend' | 'partner';
    /**
     * Session services for dev mode bypass check.
     * When dev mode is synced from frontend, this allows bypassing unlock checks.
     */
    services?: {
        devMode?: {
            enabled: boolean;
            bypassUnlocks: boolean;
        };
    };
}
/**
 * Build actual LLM tools for handoffs.
 * Returns tools ready to be used with the voice agent.
 *
 * @param currentAgentIdOrOptions - Current agent ID or options object
 * @returns Record of tool name -> tool
 */
export declare function buildHandoffTools(currentAgentIdOrOptions?: string | BuildHandoffToolsOptions): Promise<{
    tools: Record<string, unknown>;
    toolCount: number;
    agentIds: string[];
}>;
/**
 * Get handoff tools for a specific agent.
 * Convenience wrapper that filters tools based on the current agent and user unlock status.
 *
 * @param currentAgentId - The current agent's ID
 * @param options - Optional user context for unlock filtering
 * @returns Tools available for this agent to use
 */
export declare function getHandoffToolsForAgent(currentAgentId: string, options?: {
    userProfile?: UserProfile | null;
    subscriptionTier?: 'free' | 'friend' | 'partner';
}): Promise<Record<string, unknown>>;
export { createHandoffTools as default };
//# sourceMappingURL=handoff-factory.d.ts.map