/**
 * Team Handler Registry
 *
 * Central registry for cross-agent communication handlers.
 * Replaces the hard-coded *-team-handlers.ts files with a
 * configuration-driven approach.
 *
 * USAGE:
 *
 * // Register a handler
 * teamHandlerRegistry.registerHandler({
 *   id: 'createSavingsGoal',
 *   name: 'Create Savings Goal',
 *   capability: 'savings-goals',
 *   execute: async (request) => { ... }
 * }, 'maya');
 *
 * // Route a request
 * const result = await teamHandlerRegistry.routeRequest(
 *   'createSavingsGoal',
 *   { toolName: 'createSavingsGoal', params: { ... } },
 *   { fromAgent: 'jordan' }
 * );
 */
import { type AgentId, type ToolExecutionRequest, type ToolExecutionResult } from '../agent-bus.js';
import { type TeamHandlerDefinition, type HandlerCapability, type AgentHandlerConfig, type SharedContext, type ContextShareHandler, type AgentNotification, type NotificationHandler, type TeamHandlerRegistryEventHandler, type TeamHandlerRegistryOptions, type RouteRequestOptions } from './types.js';
export declare class TeamHandlerRegistry {
    /** All registered handlers: handlerId -> definition */
    private handlers;
    /** Agent -> handler IDs mapping */
    private agentHandlers;
    /** Capability -> handler IDs mapping */
    private capabilityIndex;
    /** Agent configurations */
    private agentConfigs;
    /** Context share handlers */
    private contextShareHandlers;
    /** Notification handlers */
    private notificationHandlers;
    /** Event emitter */
    private emitter;
    /** Initialization flag */
    private initialized;
    /** Options */
    private options;
    constructor(options?: TeamHandlerRegistryOptions);
    /**
     * Register a handler for a specific agent
     */
    registerHandler(definition: TeamHandlerDefinition, agentId: AgentId): void;
    /**
     * Register multiple handlers for an agent
     */
    registerHandlers(definitions: TeamHandlerDefinition[], agentId: AgentId): void;
    /**
     * Unregister a handler
     */
    unregisterHandler(handlerId: string, agentId: AgentId): boolean;
    /**
     * Register handler with the Agent Bus
     */
    private registerWithAgentBus;
    private indexByCapability;
    /**
     * Configure an agent's handler capabilities
     */
    configureAgent(config: AgentHandlerConfig): void;
    /**
     * Get agent configuration
     */
    getAgentConfig(agentId: AgentId): AgentHandlerConfig | undefined;
    /**
     * Activate an agent for handling requests
     */
    activateAgent(agentId: AgentId): void;
    /**
     * Deactivate an agent
     */
    deactivateAgent(agentId: AgentId): void;
    /**
     * Route a request to the appropriate handler
     */
    routeRequest(handlerId: string, request: ToolExecutionRequest, options: RouteRequestOptions & {
        fromAgent: AgentId;
    }): Promise<ToolExecutionResult>;
    /**
     * Route a request by capability (find a handler that can do it)
     */
    routeByCapability(capability: HandlerCapability, request: ToolExecutionRequest, options: RouteRequestOptions & {
        fromAgent: AgentId;
    }): Promise<ToolExecutionResult>;
    /**
     * Find an agent that can handle a specific handler
     */
    private findHandlingAgent;
    /**
     * Register a handler for context sharing events
     */
    onContextShare(agentId: AgentId, handler: ContextShareHandler): void;
    /**
     * Share context with another agent
     */
    shareContext(context: SharedContext): Promise<void>;
    /**
     * Register a handler for notifications
     */
    onNotification(agentId: AgentId, handler: NotificationHandler): void;
    /**
     * Send a notification to an agent
     */
    notify(notification: AgentNotification): Promise<void>;
    /**
     * Subscribe to registry events
     */
    on(handler: TeamHandlerRegistryEventHandler): () => void;
    private emit;
    /**
     * Get a handler definition
     */
    getHandler(handlerId: string): TeamHandlerDefinition | undefined;
    /**
     * Get all handlers for an agent
     */
    getAgentHandlers(agentId: AgentId): TeamHandlerDefinition[];
    /**
     * Get handlers by capability
     */
    getByCapability(capability: HandlerCapability): TeamHandlerDefinition[];
    /**
     * Get all handlers
     */
    getAllHandlers(): TeamHandlerDefinition[];
    /**
     * Get all active agents
     */
    getActiveAgents(): AgentId[];
    /**
     * Get registry statistics
     */
    getStats(): {
        totalHandlers: number;
        byCapability: Record<HandlerCapability, number>;
        byAgent: Record<string, number>;
        activeAgents: number;
    };
    /**
     * Check if registry is initialized
     */
    isInitialized(): boolean;
    /**
     * Mark registry as initialized
     */
    markInitialized(): void;
    /**
     * Clear the registry
     */
    clear(): void;
}
/**
 * Global team handler registry instance
 */
export declare const teamHandlerRegistry: TeamHandlerRegistry;
/**
 * Register a handler with the global registry
 */
export declare function registerTeamHandler(definition: TeamHandlerDefinition, agentId: AgentId): void;
/**
 * Route a request through the registry
 */
export declare function routeTeamRequest(handlerId: string, request: ToolExecutionRequest, options: RouteRequestOptions & {
    fromAgent: AgentId;
}): Promise<ToolExecutionResult>;
export type { TeamHandlerDefinition, TeamHandlerFunction, HandlerCapability, AgentHandlerConfig, SharedContext, ContextShareHandler, AgentNotification, NotificationHandler, TeamHandlerRegistryEvent, TeamHandlerRegistryEventHandler, TeamHandlerRegistryOptions, RouteRequestOptions, } from './types.js';
export { ALL_HANDLER_CAPABILITIES, validateHandlerDefinition } from './types.js';
export default teamHandlerRegistry;
//# sourceMappingURL=index.d.ts.map