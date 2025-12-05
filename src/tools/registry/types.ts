/**
 * Tool Registry Types
 *
 * Core types for the domain-based tool registry system.
 * This enables agent-agnostic tool organization where tools are
 * registered by capability/domain rather than by persona.
 *
 * DESIGN PRINCIPLES:
 * 1. Tools are registered by WHAT they do, not WHO uses them
 * 2. Agents select tools by domain in their manifest
 * 3. No agent-specific code in tool implementations
 * 4. Tools are composable and reusable across agents
 */

// ============================================================================
// TOOL DOMAINS
// ============================================================================

/**
 * Tool domains represent functional areas.
 * Agents select which domains they need in their manifest.
 */
export type ToolDomain =
  | 'memory' // User memory, recall, relationship tracking
  | 'calendar' // Appointments, scheduling, delivery tracking
  | 'communication' // Email, SMS, messaging, coaching
  | 'habits' // Habit tracking, gamification, behavioral coaching
  | 'finance' // Banking, spending analysis, budgeting
  | 'research' // Stock research, market analysis, due diligence
  | 'productivity' // Tasks, notes, routines, shopping lists
  | 'life-planning' // Goals, milestones, life events, celebrations
  | 'wellness' // Health tracking, medications, wellness check-ins
  | 'entertainment' // Music, media, leisure activities
  | 'information' // News, weather, sports, search
  | 'wisdom' // Quotes, principles, educational content
  | 'handoff' // Agent-to-agent handoff tools
  | 'telephony' // Phone calls, callbacks
  | 'grief' // Grief support and processing tools
  | 'meaning' // Meaning and purpose exploration tools
  | 'relationships' // Relationship guidance and support tools
  | 'stories' // Storytelling and narrative tools
  | 'curiosity' // Curiosity and exploration tools
  | 'vulnerability' // Vulnerability and emotional opening tools
  | 'dreams' // Dream exploration and interpretation
  | 'play' // Playfulness and creative expression
  | 'self-compassion' // Self-compassion and self-care
  | 'presence' // Mindfulness and presence tools
  | 'proactive' // Proactive check-ins and follow-ups
  | 'awareness' // World awareness - time, context, environment
  | 'engagement'; // Daily rituals, games, streaks, team interactions

/**
 * All available tool domains
 */
export const ALL_TOOL_DOMAINS: readonly ToolDomain[] = [
  'memory',
  'calendar',
  'communication',
  'habits',
  'finance',
  'research',
  'productivity',
  'life-planning',
  'wellness',
  'entertainment',
  'information',
  'wisdom',
  'handoff',
  'telephony',
  'grief',
  'meaning',
  'relationships',
  'stories',
  'curiosity',
  'vulnerability',
  'dreams',
  'play',
  'self-compassion',
  'presence',
  'proactive',
  'awareness',
  'engagement',
] as const;

// ============================================================================
// TOOL CATEGORIES (for UI/filtering)
// ============================================================================

/**
 * High-level categories for tool organization
 */
export type ToolCategory =
  | 'core' // Essential tools (memory, handoff)
  | 'productivity' // Task management, notes, routines
  | 'financial' // Money-related tools
  | 'communication' // Messaging and scheduling
  | 'lifestyle' // Health, habits, wellness
  | 'information' // News, weather, search
  | 'entertainment'; // Music, media

/**
 * Mapping from domains to categories
 */
export const DOMAIN_TO_CATEGORY: Record<ToolDomain, ToolCategory> = {
  memory: 'core',
  handoff: 'core',
  calendar: 'productivity',
  productivity: 'productivity',
  communication: 'communication',
  telephony: 'communication',
  habits: 'lifestyle',
  wellness: 'lifestyle',
  'life-planning': 'lifestyle',
  finance: 'financial',
  research: 'financial',
  information: 'information',
  wisdom: 'information',
  entertainment: 'entertainment',
  // Emotional/wisdom domains
  grief: 'lifestyle',
  meaning: 'lifestyle',
  relationships: 'lifestyle',
  stories: 'information',
  curiosity: 'information',
  vulnerability: 'lifestyle',
  dreams: 'lifestyle',
  play: 'entertainment',
  'self-compassion': 'lifestyle',
  presence: 'lifestyle',
  proactive: 'core',
  awareness: 'core',
  engagement: 'core',
};

// ============================================================================
// EXTERNAL SERVICES
// ============================================================================

/**
 * External services that tools may require
 */
export type ExternalService =
  | 'plaid' // Banking integration
  | 'google-calendar' // Google Calendar API
  | 'google-contacts' // Google Contacts API
  | 'spotify' // Music streaming
  | 'sendgrid' // Email service
  | 'twilio' // SMS/phone service
  | 'openweather' // Weather API
  | 'newsapi' // News aggregation
  | 'alpha-vantage' // Stock data
  | 'finnhub' // Financial data
  | 'firebase'; // Firestore/Auth

// ============================================================================
// TOOL DEFINITION
// ============================================================================

/**
 * Configuration passed to tool factory functions
 */
export interface ToolContext {
  /** Current user ID */
  userId: string;

  /** Agent ID using this tool */
  agentId: string;

  /** Agent's display name */
  agentDisplayName: string;

  /** Agent's manifest configuration */
  agentManifest?: AgentManifestRef;

  /** Initialized external services */
  services: ServiceRegistry;

  /** Optional domain-specific configuration from manifest */
  domainConfig?: Record<string, unknown>;
}

/**
 * Reference to agent manifest (avoid circular dependency)
 */
export interface AgentManifestRef {
  identity: {
    id: string;
    name: string;
    display_name: string;
  };
  personality?: {
    warmth: number;
    directness: number;
    humor_level: number;
  };
  tools?: {
    domains?: ToolDomain[];
    required?: string[];
    optional?: string[];
    forbidden?: string[];
  };
}

/**
 * Registry of initialized external services
 */
export interface ServiceRegistry {
  /** Check if a service is available */
  has(service: ExternalService): boolean;

  /** Get service instance (throws if not available) */
  get<T>(service: ExternalService): T;

  /** Get service instance or undefined */
  getOptional<T>(service: ExternalService): T | undefined;
}

/**
 * A callable tool function (LiveKit agents compatible)
 *
 * Note: This is a flexible type that accommodates both our custom tools
 * and LiveKit's FunctionTool. When using llm.tool(), cast the result
 * to Tool using `as Tool` or `as unknown as Tool`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Tool = any;

/**
 * Stricter tool interface for custom implementations
 */
export interface StrictTool {
  /** Tool description for LLM */
  description: string;

  /** Parameter schema (JSON Schema) */
  parameters?: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };

  /** Execute the tool */
  execute: (params: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Tool definition for registry
 */
export interface ToolDefinition {
  /** Unique tool identifier (e.g., 'createAppointment', 'getHabitStats') */
  id: string;

  /** Human-readable name */
  name: string;

  /** Description for documentation (not the LLM description) */
  description: string;

  /** Primary domain this tool belongs to */
  domain: ToolDomain;

  /** Additional domains this tool is relevant to */
  additionalDomains?: ToolDomain[];

  /** Category for UI grouping */
  category?: ToolCategory;

  /** Factory function to create the tool instance */
  create: (ctx: ToolContext) => Tool;

  /** External services required by this tool */
  requiredServices?: ExternalService[];

  /** Tool is experimental/beta */
  experimental?: boolean;

  /** Tool is deprecated (will be removed) */
  deprecated?: boolean;

  /** Deprecation message */
  deprecationMessage?: string;

  /** Tags for filtering/search */
  tags?: string[];

  /** Version this tool was introduced */
  since?: string;
}

// ============================================================================
// TOOL SET SPECIFICATION
// ============================================================================

/**
 * Specification for building a tool set
 * (Matches the manifest tools section)
 */
export interface ToolSetSpec {
  /** Domains to include all tools from */
  domains?: ToolDomain[];

  /** Specific tool IDs that must be included */
  required?: string[];

  /** Specific tool IDs that can be included */
  optional?: string[];

  /** Tool IDs that must NOT be included */
  forbidden?: string[];

  /** Domain-specific configuration */
  domainConfig?: Record<ToolDomain, Record<string, unknown>>;
}

/**
 * Result of building a tool set
 */
export interface ToolSetResult {
  /** The built tools */
  tools: Record<string, Tool>;

  /** Tools that couldn't be created (missing services, etc.) */
  skipped: Array<{
    toolId: string;
    reason: string;
  }>;

  /** Warnings during build */
  warnings: string[];

  /** Statistics */
  stats: {
    total: number;
    byDomain: Record<ToolDomain, number>;
    byCategory: Record<ToolCategory, number>;
  };
}

// ============================================================================
// REGISTRY EVENTS
// ============================================================================

/**
 * Events emitted by the tool registry
 */
export type RegistryEvent =
  | { type: 'tool_registered'; tool: ToolDefinition }
  | { type: 'tool_unregistered'; toolId: string }
  | { type: 'domain_registered'; domain: ToolDomain; toolCount: number }
  | { type: 'build_complete'; agentId: string; toolCount: number };

export type RegistryEventHandler = (event: RegistryEvent) => void;

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate a tool definition
 */
export function validateToolDefinition(def: Partial<ToolDefinition>): string[] {
  const errors: string[] = [];

  if (!def.id) {
    errors.push('Tool ID is required');
  } else if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(def.id)) {
    errors.push('Tool ID must be alphanumeric and start with a letter');
  }

  if (!def.name) {
    errors.push('Tool name is required');
  }

  if (!def.domain) {
    errors.push('Tool domain is required');
  } else if (!ALL_TOOL_DOMAINS.includes(def.domain)) {
    errors.push(`Invalid domain: ${def.domain}`);
  }

  if (!def.create || typeof def.create !== 'function') {
    errors.push('Tool create function is required');
  }

  return errors;
}

/**
 * Validate a tool set specification
 */
export function validateToolSetSpec(spec: Partial<ToolSetSpec>): string[] {
  const errors: string[] = [];

  if (spec.domains) {
    for (const domain of spec.domains) {
      if (!ALL_TOOL_DOMAINS.includes(domain)) {
        errors.push(`Invalid domain in spec: ${domain}`);
      }
    }
  }

  // Check for conflicts
  if (spec.required && spec.forbidden) {
    const conflicts = spec.required.filter((id) => spec.forbidden?.includes(id));
    if (conflicts.length > 0) {
      errors.push(`Tools cannot be both required and forbidden: ${conflicts.join(', ')}`);
    }
  }

  return errors;
}

// ============================================================================
// HELPER TYPES
// ============================================================================

/**
 * Options for querying the registry
 */
export interface RegistryQueryOptions {
  /** Filter by domain */
  domain?: ToolDomain;

  /** Filter by domains (any match) */
  domains?: ToolDomain[];

  /** Filter by category */
  category?: ToolCategory;

  /** Include experimental tools */
  includeExperimental?: boolean;

  /** Include deprecated tools */
  includeDeprecated?: boolean;

  /** Filter by tags */
  tags?: string[];

  /** Filter by required services */
  requiresService?: ExternalService;
}

/**
 * Tool metadata (without the create function)
 */
export type ToolMetadata = Omit<ToolDefinition, 'create'>;

/**
 * Default service registry implementation (no services)
 */
export class EmptyServiceRegistry implements ServiceRegistry {
  has(): boolean {
    return false;
  }

  get<T>(service: ExternalService): T {
    throw new Error(`Service not available: ${service}`);
  }

  getOptional<T>(): T | undefined {
    return undefined;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  ALL_TOOL_DOMAINS,
  DOMAIN_TO_CATEGORY,
  validateToolDefinition,
  validateToolSetSpec,
  EmptyServiceRegistry,
};

