/**
 * Team Handler Registry Types
 *
 * Defines the types for a generic team handler system that allows
 * cross-agent communication without hard-coded agent names.
 *
 * DESIGN PRINCIPLES:
 * 1. Handlers are registered by capability, not by agent name
 * 2. Agents declare which capabilities they can handle in their manifest
 * 3. The registry routes requests to the appropriate handler
 * 4. Handlers can be shared across agents with similar capabilities
 */

import type { AgentId, ToolExecutionRequest, ToolExecutionResult } from '../agent-bus.js';

// ============================================================================
// HANDLER CAPABILITIES
// ============================================================================

/**
 * Capability domains for team handlers
 * Similar to tool domains, but for inter-agent communication
 */
export type HandlerCapability =
  // Financial
  | 'savings-goals' // Create/manage savings goals
  | 'budgets' // Create/manage budgets
  | 'expense-tracking' // Track expenses
  | 'financial-status' // Report financial status

  // Life Planning
  | 'milestones' // Manage life milestones
  | 'goals' // Manage life goals
  | 'retirement' // Retirement planning

  // Communication
  | 'scheduling' // Schedule events/appointments
  | 'reminders' // Set reminders
  | 'notifications' // Send notifications
  | 'contacts' // Manage contacts

  // Coordination
  | 'team-status' // Report team status
  | 'context-sharing' // Share context between agents
  | 'escalation' // Handle escalations

  // Research
  | 'insights' // Provide insights
  | 'analysis'; // Analyze data;

/**
 * All handler capabilities
 */
export const ALL_HANDLER_CAPABILITIES: readonly HandlerCapability[] = [
  'savings-goals',
  'budgets',
  'expense-tracking',
  'financial-status',
  'milestones',
  'goals',
  'retirement',
  'scheduling',
  'reminders',
  'notifications',
  'contacts',
  'team-status',
  'context-sharing',
  'escalation',
  'insights',
  'analysis',
] as const;

// ============================================================================
// HANDLER DEFINITION
// ============================================================================

/**
 * Handler function signature
 */
export type TeamHandlerFunction = (request: ToolExecutionRequest) => Promise<ToolExecutionResult>;

/**
 * Definition for a team handler
 */
export interface TeamHandlerDefinition {
  /** Unique handler ID (e.g., 'createSavingsGoal', 'scheduleEvent') */
  id: string;

  /** Human-readable name */
  name: string;

  /** Description of what this handler does */
  description: string;

  /** Primary capability this handler provides */
  capability: HandlerCapability;

  /** Additional capabilities this handler supports */
  additionalCapabilities?: HandlerCapability[];

  /** The handler function */
  execute: TeamHandlerFunction;

  /** Which agent(s) can execute this handler (if undefined, any capable agent) */
  executingAgents?: AgentId[];

  /** Tags for filtering/search */
  tags?: string[];

  /** Is this handler experimental? */
  experimental?: boolean;
}

// ============================================================================
// AGENT HANDLER CONFIG
// ============================================================================

/**
 * Configuration for an agent's handlers
 * (Can be derived from manifest)
 */
export interface AgentHandlerConfig {
  /** Agent ID */
  agentId: AgentId;

  /** Display name */
  displayName: string;

  /** Capabilities this agent can handle */
  capabilities: HandlerCapability[];

  /** Specific handler IDs this agent provides */
  handlers?: string[];

  /** Handlers this agent should NOT use (even if capable) */
  excludedHandlers?: string[];

  /** Is this agent active for handling requests? */
  active: boolean;
}

// ============================================================================
// CONTEXT SHARING
// ============================================================================

/**
 * Context shared between agents during handoff or coordination
 */
export interface SharedContext {
  /** Source agent */
  fromAgent: AgentId;

  /** Target agent */
  toAgent: AgentId;

  /** User ID */
  userId?: string;

  /** Session ID */
  sessionId?: string;

  /** Context data */
  data: Record<string, unknown>;

  /** Timestamp */
  timestamp: Date;
}

/**
 * Handler for context sharing events
 */
export type ContextShareHandler = (context: SharedContext) => void | Promise<void>;

// ============================================================================
// NOTIFICATION
// ============================================================================

/**
 * Notification from one agent to another
 */
export interface AgentNotification {
  /** Source agent */
  fromAgent: AgentId;

  /** Target agent(s) - can be specific agent or 'all' */
  toAgent: AgentId | 'all';

  /** Notification type */
  type: string;

  /** Notification data */
  data: Record<string, unknown>;

  /** Priority */
  priority?: 'low' | 'normal' | 'high';

  /** User ID */
  userId?: string;

  /** Timestamp */
  timestamp: Date;
}

/**
 * Handler for notifications
 */
export type NotificationHandler = (notification: AgentNotification) => void | Promise<void>;

// ============================================================================
// REGISTRY EVENTS
// ============================================================================

/**
 * Events emitted by the team handler registry
 */
export type TeamHandlerRegistryEvent =
  | { type: 'handler_registered'; handler: TeamHandlerDefinition; agentId: AgentId }
  | { type: 'handler_unregistered'; handlerId: string; agentId: AgentId }
  | { type: 'agent_activated'; agentId: AgentId }
  | { type: 'agent_deactivated'; agentId: AgentId }
  | { type: 'request_routed'; handlerId: string; fromAgent: AgentId; toAgent: AgentId }
  | { type: 'request_completed'; handlerId: string; success: boolean };

export type TeamHandlerRegistryEventHandler = (event: TeamHandlerRegistryEvent) => void;

// ============================================================================
// REGISTRY OPTIONS
// ============================================================================

/**
 * Options for initializing the team handler registry
 */
export interface TeamHandlerRegistryOptions {
  /** Load handlers from manifests automatically */
  autoLoadFromManifests?: boolean;

  /** Register with Agent Bus automatically */
  autoRegisterWithBus?: boolean;

  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Options for routing a request
 */
export interface RouteRequestOptions {
  /** Preferred agent to handle the request */
  preferredAgent?: AgentId;

  /** Exclude these agents from handling */
  excludeAgents?: AgentId[];

  /** Timeout in milliseconds */
  timeout?: number;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate a handler definition
 */
export function validateHandlerDefinition(def: Partial<TeamHandlerDefinition>): string[] {
  const errors: string[] = [];

  if (!def.id) {
    errors.push('Handler ID is required');
  } else if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(def.id)) {
    errors.push('Handler ID must be alphanumeric and start with a letter');
  }

  if (!def.name) {
    errors.push('Handler name is required');
  }

  if (!def.capability) {
    errors.push('Handler capability is required');
  } else if (!ALL_HANDLER_CAPABILITIES.includes(def.capability)) {
    errors.push(`Invalid capability: ${def.capability}`);
  }

  if (!def.execute || typeof def.execute !== 'function') {
    errors.push('Handler execute function is required');
  }

  return errors;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  ALL_HANDLER_CAPABILITIES,
  validateHandlerDefinition,
};
