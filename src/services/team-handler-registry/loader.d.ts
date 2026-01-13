/**
 * Team Handler Registry Loader
 *
 * Loads team handlers from:
 * 1. Legacy *-team-handlers.ts files (for backwards compatibility)
 * 2. Agent manifests (new approach)
 *
 * This provides a migration path from the old system to the new one.
 */
import type { AgentId } from '../agent-bus.js';
import type { TeamHandlerDefinition, HandlerCapability } from './types.js';
/**
 * Load handlers from legacy *-team-handlers.ts files
 * This maintains backwards compatibility during migration
 */
export declare function loadLegacyHandlers(): Promise<{
    loaded: number;
    errors: string[];
}>;
/**
 * Load handlers from agent manifests
 * This is the preferred approach for new agents
 */
export declare function loadHandlersFromManifests(): Promise<{
    loaded: number;
    errors: string[];
}>;
/**
 * Initialize the team handler registry
 * Loads from both legacy handlers and manifests
 */
export declare function initializeTeamHandlerRegistry(options?: {
    loadLegacy?: boolean;
    loadManifests?: boolean;
}): Promise<{
    legacy: {
        loaded: number;
        errors: string[];
    };
    manifests: {
        loaded: number;
        errors: string[];
    };
}>;
/**
 * Wrap a legacy handler function in a TeamHandlerDefinition
 * Use this when migrating handlers from legacy files
 */
export declare function wrapLegacyHandler(id: string, name: string, description: string, capability: HandlerCapability, execute: TeamHandlerDefinition['execute'], options?: {
    additionalCapabilities?: HandlerCapability[];
    executingAgents?: AgentId[];
    tags?: string[];
}): TeamHandlerDefinition;
declare const _default: {
    loadLegacyHandlers: typeof loadLegacyHandlers;
    loadHandlersFromManifests: typeof loadHandlersFromManifests;
    initializeTeamHandlerRegistry: typeof initializeTeamHandlerRegistry;
    wrapLegacyHandler: typeof wrapLegacyHandler;
    AGENT_CAPABILITIES: Record<AgentId, HandlerCapability[]>;
};
export default _default;
//# sourceMappingURL=loader.d.ts.map