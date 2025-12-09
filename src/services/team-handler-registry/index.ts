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

import { getLogger } from '../../utils/safe-logger.js';

import { EventEmitter } from 'events';
import { getAgentBus, type AgentId, type ToolExecutionRequest, type ToolExecutionResult } from '../agent-bus.js';
import type {
  TeamHandlerDefinition,
  TeamHandlerFunction,
  HandlerCapability,
  AgentHandlerConfig,
  SharedContext,
  ContextShareHandler,
  AgentNotification,
  NotificationHandler,
  TeamHandlerRegistryEvent,
  TeamHandlerRegistryEventHandler,
  TeamHandlerRegistryOptions,
  RouteRequestOptions,


} from './types.js';
import { validateHandlerDefinition, ALL_HANDLER_CAPABILITIES } from './types.js';

// ============================================================================
// TEAM HANDLER REGISTRY CLASS
// ============================================================================

export class TeamHandlerRegistry {
  /** All registered handlers: handlerId -> definition */
  private handlers = new Map<string, TeamHandlerDefinition>();

  /** Agent -> handler IDs mapping */
  private agentHandlers = new Map<AgentId, Set<string>>();

  /** Capability -> handler IDs mapping */
  private capabilityIndex = new Map<HandlerCapability, Set<string>>();

  /** Agent configurations */
  private agentConfigs = new Map<AgentId, AgentHandlerConfig>();

  /** Context share handlers */
  private contextShareHandlers = new Map<AgentId, ContextShareHandler>();

  /** Notification handlers */
  private notificationHandlers = new Map<AgentId, NotificationHandler>();

  /** Event emitter */
  private emitter = new EventEmitter();

  /** Initialization flag */
  private initialized = false;

  /** Options */
  private options: TeamHandlerRegistryOptions;

  constructor(options: TeamHandlerRegistryOptions = {}) {
    this.options = options;

    // Initialize capability indexes
    for (const capability of ALL_HANDLER_CAPABILITIES) {
      this.capabilityIndex.set(capability, new Set());
    }
  }

  // ==========================================================================
  // HANDLER REGISTRATION
  // ==========================================================================

  /**
   * Register a handler for a specific agent
   */
  registerHandler(definition: TeamHandlerDefinition, agentId: AgentId): void {
    // Validate
    const errors = validateHandlerDefinition(definition);
    if (errors.length > 0) {
      getLogger().error({ handlerId: definition.id, errors }, 'Invalid handler definition');
      throw new Error(`Invalid handler definition: ${errors.join(', ')}`);
    }

    // Store the handler
    this.handlers.set(definition.id, definition);

    // Index by agent
    if (!this.agentHandlers.has(agentId)) {
      this.agentHandlers.set(agentId, new Set());
    }
    this.agentHandlers.get(agentId)!.add(definition.id);

    // Index by capability
    this.indexByCapability(definition.capability, definition.id);
    if (definition.additionalCapabilities) {
      for (const cap of definition.additionalCapabilities) {
        this.indexByCapability(cap, definition.id);
      }
    }

    // Register with Agent Bus if configured
    if (this.options.autoRegisterWithBus) {
      this.registerWithAgentBus(definition, agentId);
    }

    // Emit event
    this.emit({ type: 'handler_registered', handler: definition, agentId });

    getLogger().debug(
      { handlerId: definition.id, agentId, capability: definition.capability },
      'Handler registered'
    );
  }

  /**
   * Register multiple handlers for an agent
   */
  registerHandlers(definitions: TeamHandlerDefinition[], agentId: AgentId): void {
    for (const def of definitions) {
      this.registerHandler(def, agentId);
    }
  }

  /**
   * Unregister a handler
   */
  unregisterHandler(handlerId: string, agentId: AgentId): boolean {
    const definition = this.handlers.get(handlerId);
    if (!definition) {
      return false;
    }

    // Remove from agent index
    this.agentHandlers.get(agentId)?.delete(handlerId);

    // Remove from capability index
    this.capabilityIndex.get(definition.capability)?.delete(handlerId);
    if (definition.additionalCapabilities) {
      for (const cap of definition.additionalCapabilities) {
        this.capabilityIndex.get(cap)?.delete(handlerId);
      }
    }

    // Remove from main map
    this.handlers.delete(handlerId);

    // Emit event
    this.emit({ type: 'handler_unregistered', handlerId, agentId });

    return true;
  }

  /**
   * Register handler with the Agent Bus
   */
  private registerWithAgentBus(definition: TeamHandlerDefinition, agentId: AgentId): void {
    try {
      const bus = getAgentBus();
      bus.registerToolHandler(agentId, definition.id, definition.execute);
      getLogger().debug({ handlerId: definition.id, agentId }, 'Handler registered with Agent Bus');
    } catch (error) {
      getLogger().error({ error, handlerId: definition.id }, 'Failed to register with Agent Bus');
    }
  }

  private indexByCapability(capability: HandlerCapability, handlerId: string): void {
    if (!this.capabilityIndex.has(capability)) {
      this.capabilityIndex.set(capability, new Set());
    }
    this.capabilityIndex.get(capability)!.add(handlerId);
  }

  // ==========================================================================
  // AGENT CONFIGURATION
  // ==========================================================================

  /**
   * Configure an agent's handler capabilities
   */
  configureAgent(config: AgentHandlerConfig): void {
    this.agentConfigs.set(config.agentId, config);

    if (config.active) {
      this.emit({ type: 'agent_activated', agentId: config.agentId });
    }

    getLogger().debug(
      { agentId: config.agentId, capabilities: config.capabilities },
      'Agent configured'
    );
  }

  /**
   * Get agent configuration
   */
  getAgentConfig(agentId: AgentId): AgentHandlerConfig | undefined {
    return this.agentConfigs.get(agentId);
  }

  /**
   * Activate an agent for handling requests
   */
  activateAgent(agentId: AgentId): void {
    const config = this.agentConfigs.get(agentId);
    if (config) {
      config.active = true;
      this.emit({ type: 'agent_activated', agentId });
    }
  }

  /**
   * Deactivate an agent
   */
  deactivateAgent(agentId: AgentId): void {
    const config = this.agentConfigs.get(agentId);
    if (config) {
      config.active = false;
      this.emit({ type: 'agent_deactivated', agentId });
    }
  }

  // ==========================================================================
  // REQUEST ROUTING
  // ==========================================================================

  /**
   * Route a request to the appropriate handler
   */
  async routeRequest(
    handlerId: string,
    request: ToolExecutionRequest,
    options: RouteRequestOptions & { fromAgent: AgentId }
  ): Promise<ToolExecutionResult> {
    const definition = this.handlers.get(handlerId);
    if (!definition) {
      return {
        success: false,
        error: `Handler not found: ${handlerId}`,
        executedBy: 'ferni' as AgentId, // Default to coordinator
      };
    }

    // Find an agent that can handle this request
    const targetAgent = this.findHandlingAgent(handlerId, options);
    if (!targetAgent) {
      return {
        success: false,
        error: `No active agent available for handler: ${handlerId}`,
        executedBy: 'ferni' as AgentId, // Default to coordinator
      };
    }

    // Emit routing event
    this.emit({
      type: 'request_routed',
      handlerId,
      fromAgent: options.fromAgent,
      toAgent: targetAgent,
    });

    try {
      // Execute the handler
      const result = await definition.execute(request);

      // Emit completion event
      this.emit({ type: 'request_completed', handlerId, success: result.success });

      return {
        ...result,
        executedBy: targetAgent,
      };
    } catch (error) {
      getLogger().error({ error, handlerId, targetAgent }, 'Handler execution failed');

      this.emit({ type: 'request_completed', handlerId, success: false });

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executedBy: targetAgent,
      };
    }
  }

  /**
   * Route a request by capability (find a handler that can do it)
   */
  async routeByCapability(
    capability: HandlerCapability,
    request: ToolExecutionRequest,
    options: RouteRequestOptions & { fromAgent: AgentId }
  ): Promise<ToolExecutionResult> {
    const handlerIds = this.capabilityIndex.get(capability);
    if (!handlerIds || handlerIds.size === 0) {
      return {
        success: false,
        error: `No handlers available for capability: ${capability}`,
        executedBy: 'ferni' as AgentId, // Default to coordinator
      };
    }

    // Find the first available handler
    for (const handlerId of handlerIds) {
      const targetAgent = this.findHandlingAgent(handlerId, options);
      if (targetAgent) {
        return this.routeRequest(handlerId, request, options);
      }
    }

    return {
      success: false,
      error: `No active agent available for capability: ${capability}`,
      executedBy: 'ferni' as AgentId, // Default to coordinator
    };
  }

  /**
   * Find an agent that can handle a specific handler
   */
  private findHandlingAgent(handlerId: string, options: RouteRequestOptions): AgentId | undefined {
    const definition = this.handlers.get(handlerId);
    if (!definition) return undefined;

    // Check preferred agent first
    if (options.preferredAgent) {
      const handlers = this.agentHandlers.get(options.preferredAgent);
      const config = this.agentConfigs.get(options.preferredAgent);
      if (handlers?.has(handlerId) && config?.active !== false) {
        return options.preferredAgent;
      }
    }

    // Find any agent that has this handler
    for (const [agentId, handlers] of this.agentHandlers) {
      // Skip excluded agents
      if (options.excludeAgents?.includes(agentId)) continue;

      // Check if agent has this handler
      if (!handlers.has(handlerId)) continue;

      // Check if agent is active
      const config = this.agentConfigs.get(agentId);
      if (config?.active === false) continue;

      // Check if handler specifies executing agents
      if (definition.executingAgents && !definition.executingAgents.includes(agentId)) {
        continue;
      }

      return agentId;
    }

    return undefined;
  }

  // ==========================================================================
  // CONTEXT SHARING
  // ==========================================================================

  /**
   * Register a handler for context sharing events
   */
  onContextShare(agentId: AgentId, handler: ContextShareHandler): void {
    this.contextShareHandlers.set(agentId, handler);
  }

  /**
   * Share context with another agent
   */
  async shareContext(context: SharedContext): Promise<void> {
    const handler = this.contextShareHandlers.get(context.toAgent);
    if (handler) {
      await handler(context);
    }

    // Also emit on Agent Bus
    try {
      const bus = getAgentBus();
      bus.shareContext(context.fromAgent, context.toAgent, context.data, context.userId);
    } catch (error) {
      getLogger().warn({ error }, 'Failed to share context via Agent Bus');
    }
  }

  // ==========================================================================
  // NOTIFICATIONS
  // ==========================================================================

  /**
   * Register a handler for notifications
   */
  onNotification(agentId: AgentId, handler: NotificationHandler): void {
    this.notificationHandlers.set(agentId, handler);
  }

  /**
   * Send a notification to an agent
   */
  async notify(notification: AgentNotification): Promise<void> {
    if (notification.toAgent === 'all') {
      // Broadcast to all handlers
      for (const handler of this.notificationHandlers.values()) {
        await handler(notification);
      }
    } else {
      const handler = this.notificationHandlers.get(notification.toAgent);
      if (handler) {
        await handler(notification);
      }
    }
  }

  // ==========================================================================
  // EVENTS
  // ==========================================================================

  /**
   * Subscribe to registry events
   */
  on(handler: TeamHandlerRegistryEventHandler): () => void {
    this.emitter.on('event', handler);
    return () => this.emitter.off('event', handler);
  }

  private emit(event: TeamHandlerRegistryEvent): void {
    this.emitter.emit('event', event);
  }

  // ==========================================================================
  // QUERIES
  // ==========================================================================

  /**
   * Get a handler definition
   */
  getHandler(handlerId: string): TeamHandlerDefinition | undefined {
    return this.handlers.get(handlerId);
  }

  /**
   * Get all handlers for an agent
   */
  getAgentHandlers(agentId: AgentId): TeamHandlerDefinition[] {
    const handlerIds = this.agentHandlers.get(agentId);
    if (!handlerIds) return [];

    return Array.from(handlerIds)
      .map((id) => this.handlers.get(id)!)
      .filter(Boolean);
  }

  /**
   * Get handlers by capability
   */
  getByCapability(capability: HandlerCapability): TeamHandlerDefinition[] {
    const handlerIds = this.capabilityIndex.get(capability);
    if (!handlerIds) return [];

    return Array.from(handlerIds)
      .map((id) => this.handlers.get(id)!)
      .filter(Boolean);
  }

  /**
   * Get all handlers
   */
  getAllHandlers(): TeamHandlerDefinition[] {
    return Array.from(this.handlers.values());
  }

  /**
   * Get all active agents
   */
  getActiveAgents(): AgentId[] {
    return Array.from(this.agentConfigs.entries())
      .filter(([_, config]) => config.active)
      .map(([agentId]) => agentId);
  }

  // ==========================================================================
  // STATISTICS
  // ==========================================================================

  /**
   * Get registry statistics
   */
  getStats(): {
    totalHandlers: number;
    byCapability: Record<HandlerCapability, number>;
    byAgent: Record<string, number>;
    activeAgents: number;
  } {
    const byCapability: Record<string, number> = {};
    const byAgent: Record<string, number> = {};

    for (const [capability, handlers] of this.capabilityIndex) {
      byCapability[capability] = handlers.size;
    }

    for (const [agentId, handlers] of this.agentHandlers) {
      byAgent[agentId] = handlers.size;
    }

    const activeAgents = Array.from(this.agentConfigs.values()).filter((c) => c.active).length;

    return {
      totalHandlers: this.handlers.size,
      byCapability: byCapability as Record<HandlerCapability, number>,
      byAgent,
      activeAgents,
    };
  }

  /**
   * Check if registry is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Mark registry as initialized
   */
  markInitialized(): void {
    this.initialized = true;
    getLogger().info(this.getStats(), 'Team handler registry initialized');
  }

  /**
   * Clear the registry
   */
  clear(): void {
    this.handlers.clear();
    this.agentHandlers.clear();
    for (const set of this.capabilityIndex.values()) {
      set.clear();
    }
    this.agentConfigs.clear();
    this.contextShareHandlers.clear();
    this.notificationHandlers.clear();
    this.initialized = false;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/**
 * Global team handler registry instance
 */
export const teamHandlerRegistry = new TeamHandlerRegistry({
  autoRegisterWithBus: true,
});

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Register a handler with the global registry
 */
export function registerTeamHandler(definition: TeamHandlerDefinition, agentId: AgentId): void {
  teamHandlerRegistry.registerHandler(definition, agentId);
}

/**
 * Route a request through the registry
 */
export async function routeTeamRequest(
  handlerId: string,
  request: ToolExecutionRequest,
  options: RouteRequestOptions & { fromAgent: AgentId }
): Promise<ToolExecutionResult> {
  return teamHandlerRegistry.routeRequest(handlerId, request, options);
}

// ============================================================================
// EXPORTS
// ============================================================================

export type {
  TeamHandlerDefinition,
  TeamHandlerFunction,
  HandlerCapability,
  AgentHandlerConfig,
  SharedContext,
  ContextShareHandler,
  AgentNotification,
  NotificationHandler,
  TeamHandlerRegistryEvent,
  TeamHandlerRegistryEventHandler,
  TeamHandlerRegistryOptions,
  RouteRequestOptions,
} from './types.js';
import { validateHandlerDefinition, ALL_HANDLER_CAPABILITIES } from './types.js';

export { ALL_HANDLER_CAPABILITIES, validateHandlerDefinition } from './types.js';
import { validateHandlerDefinition, ALL_HANDLER_CAPABILITIES } from './types.js';

export default teamHandlerRegistry;
