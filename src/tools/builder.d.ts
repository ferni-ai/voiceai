/**
 * Agent Tool Builder
 *
 * Builds tool sets for agents based on their manifest configuration.
 * This replaces the hard-coded switch statements in factory.ts with
 * a configuration-driven approach.
 *
 * USAGE:
 *
 * // Build tools for an agent based on their manifest
 * const tools = await buildAgentTools('ferni');
 *
 * // Build tools with custom context
 * const tools = await buildAgentTools('maya-santos', {
 *   userId: 'user-123',
 *   services: myServiceRegistry
 * });
 */
import { type ServiceRegistry, type Tool, type ToolDomain, type ToolSetSpec } from './registry/types.js';
interface AgentManifestTools {
    domains?: ToolDomain[];
    required?: string[];
    optional?: string[];
    forbidden?: string[];
    domain_config?: Record<string, Record<string, unknown>>;
}
interface AgentManifestRole {
    can_handoff?: boolean;
    handoff_targets?: string[];
}
interface AgentManifest {
    identity: {
        id: string;
        name: string;
        display_name: string;
    };
    tools?: AgentManifestTools;
    role?: AgentManifestRole;
    capabilities?: Record<string, boolean>;
}
export interface BuildToolsOptions {
    /** User ID for context */
    userId?: string;
    /** Service registry for external services */
    services?: ServiceRegistry;
    /** User profile for unlock validation (required for handoff tools) */
    userProfile?: import('../types/user-profile.js').UserProfile | null;
    /** User's subscription tier for unlock validation */
    subscriptionTier?: 'free' | 'friend' | 'partner';
    /** Override manifest tools spec */
    toolsOverride?: Partial<ToolSetSpec>;
    /** Include experimental tools */
    includeExperimental?: boolean;
    /** Skip registry initialization (if already done) */
    skipRegistryInit?: boolean;
    /** Manifest to use (if already loaded) */
    manifest?: AgentManifest;
}
/**
 * Get default domains for an agent based on role
 */
declare function getDefaultDomainsForRole(roleId?: string): ToolDomain[];
/**
 * Build tools for an agent based on their manifest
 */
export declare function buildAgentTools(agentId: string, options?: BuildToolsOptions): Promise<Record<string, Tool>>;
/**
 * Build tools with a simple domain list (no manifest needed)
 */
export declare function buildToolsForDomains(domains: ToolDomain[], options?: {
    userId?: string;
    agentId?: string;
    agentDisplayName?: string;
    services?: ServiceRegistry;
}): Promise<Record<string, Tool>>;
/**
 * Check if an agent has a specific tool
 */
export declare function agentHasTool(manifest: AgentManifest, toolId: string): boolean;
/**
 * Get available tools for an agent (metadata only)
 */
export declare function getAvailableToolsForAgent(agentId: string): Promise<Array<{
    id: string;
    name: string;
    domain: ToolDomain;
}>>;
/**
 * Build tools for all team members at once
 * This replaces the parallel createPersonaTools() calls in voice-agent.ts
 */
export declare function buildAllTeamTools(options?: {
    userId?: string;
    services?: ServiceRegistry;
    /** Team member agent IDs (defaults to standard Ferni team) */
    teamMembers?: string[];
    /** Skip registry initialization */
    skipRegistryInit?: boolean;
}): Promise<{
    tools: Record<string, Tool>;
    byAgent: Record<string, Record<string, Tool>>;
    stats: {
        totalTools: number;
        uniqueTools: number;
        byAgent: Record<string, number>;
    };
}>;
/**
 * Build essential tools (always available, minimal set)
 * This replaces createEssentialTools() in factory.ts
 *
 * NOTE: Includes entertainment & information domains so agents can:
 * - Play music (playMusic, pauseMusic, etc.)
 * - Get weather, search web, etc.
 *
 * Keep this focused! Most LLMs work best with 20-60 tools max.
 * Google Gemini Realtime struggles with 100+ tools.
 *
 * IMPORTANT: 'handoff' domain is NOT included here because:
 * 1. The registry's handoff domain returns raw definitions without unlock filtering
 * 2. Proper handoff tools are added via buildHandoffToolsForAgent() which uses
 *    buildHandoffTools from handoff-factory.ts with runtime unlock validation
 * 3. This prevents locked team members from appearing in the LLM's tool list
 */
export declare function buildEssentialTools(options?: {
    userId?: string;
    services?: ServiceRegistry;
}): Promise<Record<string, Tool>>;
export { getDefaultDomainsForRole };
export type { AgentManifest, AgentManifestTools };
export default buildAgentTools;
//# sourceMappingURL=builder.d.ts.map