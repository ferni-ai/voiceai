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
  | 'vibe' // Unified environment control (music, lights, temperature)
  | 'information' // News, weather, sports, search
  | 'wisdom' // Quotes, principles, educational content
  | 'handoff' // Agent-to-agent handoff tools
  | 'telephony' // Phone calls, callbacks
  | 'voice-enrollment' // Voice enrollment for phone callers
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
  | 'engagement' // Daily rituals, games, streaks, team interactions
  | 'simple-utilities' // Everyday helpers: timers, tip calculator, unit conversions
  | 'routines' // Ferni's care routines - "What I Do For You"
  // Life Coaching Domains
  | 'crisis' // Crisis support, grounding, safety planning
  | 'health' // Exercise, nutrition, sleep, energy management
  | 'career' // Job search, interviews, professional development
  | 'decisions' // Decision frameworks, analysis, values alignment
  | 'family' // Parenting, family dynamics, elder care
  | 'home' // Home maintenance, organization, moving
  | 'learning' // Education, skill development, study planning
  | 'creativity' // Hobbies, creative projects, artistic pursuits
  | 'community' // Volunteering, giving, civic engagement
  | 'legal-admin' // Documents, estate planning, insurance
  | 'games' // Interactive music games, Name That Tune, etc.
  | 'cameo' // Team member pop-in cameos during conversations
  | 'group-conversation' // Team roundtables, conference calls with external participants
  | 'second-chances' // Fresh starts, reinvention, rebuilding after setbacks
  | 'connection' // Loneliness, friendship, belonging, community
  | 'difficult-conversations' // Preparing for and having hard conversations
  | 'life-transitions' // Emotional journey through major life changes
  | 'reflection-games' // Deep coaching games for self-discovery
  | 'quiet-growth' // Anti-hustle growth: rest, seasons, plateaus, sufficiency
  | 'pattern-mastery' // Pattern recognition, behavioral insights, habit formation
  | 'timeless-perspective' // Wisdom from history, philosophy, and long-term thinking
  | 'workflow-mastery' // Workflow optimization, process improvement, efficiency
  | 'habit-persistence' // Habit tracking persistence and behavioral insights
  | 'milestone-mastery' // Milestone tracking and achievement recognition
  | 'developer' // Developer tools: CLI commands, file editing, bash
  | 'behavior' // Behavior control: modes, pacing, processing, presence
  | 'life-thesis' // Life thesis: capturing and recalling "why" across all life domains
  | 'marketing' // Social media management: content generation, publishing, analytics
  | 'referral' // Viral growth via voice calls
  | 'smart-home' // Home Assistant, smart lights, thermostats, locks, scenes
  | 'webhooks' // Webhook automations: IFTTT, Zapier, Home Assistant, Siri Shortcuts
  | 'books' // Book tracking, recommendations, reading lists
  | 'podcasts' // Podcast discovery, listening history, recommendations
  | 'video' // Video content recommendations and tracking
  // New Life Coaching Domains (Expansion)
  | 'boundaries' // Boundary setting, people pleasing, saying no
  | 'social-skills' // Adult friendship, conversation, social anxiety
  | 'body-relationship' // Body image, diet culture, intuitive eating
  | 'anger' // Anger management, healthy expression, repair
  | 'shame' // Understanding, processing, and healing from shame
  | 'envy' // Understanding and transforming envy
  | 'resentment' // Processing and releasing resentments
  | 'caregiver' // Supporting caregivers of aging/ill loved ones
  | 'divorce' // Navigating divorce - legal, emotional, parenting
  | 'new-parent' // Adjusting to parenthood
  | 'empty-nest' // When children leave home
  | 'infidelity' // Betrayal recovery and trust rebuilding
  | 'health-diagnosis' // Chronic illness, diagnosis adjustment
  | 'job-loss' // Unemployment emotional support
  | 'sobriety' // Recovery and addiction support
  | 'sandwich-generation' // Caring for kids AND aging parents
  | 'blended-family' // Step-parenting and family merging
  | 'coming-out' // LGBTQ+ identity journey
  | 'faith-transition' // Religious/spiritual changes
  | 'dating' // Modern dating, online dating, red flags
  | 'neurodiversity' // ADHD, autism, executive function support
  | 'trauma-support' // Trauma-informed support, trigger management
  | 'procrastination' // Root cause analysis, getting started
  | 'digital-wellness' // Screen time, social media, phone addiction
  | 'perfectionism' // Perfectionism, imposter syndrome, good enough
  | 'intimacy' // Sexual wellness, desire, communication
  | 'burnout-recovery' // Burnout recovery, rest as skill
  | 'chronic-conditions' // Chronic illness, energy management
  | 'midlife' // Midlife transition, aging, legacy
  | 'breakup-recovery' // Divorce recovery, rebuilding after breakup
  | 'scheduling' // Scheduled messages, calls, emails
  | 'concierge' // AI-powered outreach: hotel quotes, restaurant reservations, appointments
  | 'travel' // Travel planning, flights, hotels, trip suggestions
  | 'settings' // User preferences: language, voice, session settings
  | 'insights' // Analytics summaries, progress tracking, weekly reviews
  | 'nayan-wisdom' // Nayan's superhuman wisdom: paradox keeper, mortality perspective, koans, enough tracker
  | 'maya-coaching' // Maya's superhuman coaching: habit DNA, friction mapping, tendencies, keystones, identity shifts
  | 'superhuman-communication' // Alex's 10 superhuman communication capabilities
  | 'jordan-planning' // Jordan's superhuman planning: event patterns, guest intelligence, milestone detection
  | 'peter-analytics' // Peter's superhuman analytics: blind spots, counterfactuals, pattern predictions
  | 'local-search' // Local search: nearby restaurants, services, places
  // Developer Platform
  | 'developer-custom' // API-registered custom tools from Developer Platform
  // Life Automation Domains
  | 'commerce' // Grocery ordering, subscription management
  | 'documents' // Receipts, warranties, IDs, expiration tracking
  | 'email-intelligence' // Email prioritization, follow-ups, unsubscribe
  | 'meal-planning' // Recipes, weekly plans, shopping lists
  | 'projects' // Multi-task projects with templates
  | 'social-events' // Birthdays, anniversaries, gift tracking
  | 'transportation' // Uber/Lyft rides, commute tracking
  | 'vehicle' // Maintenance schedules, registration alerts
  | 'workflows'; // Custom automations, IFTTT-style triggers

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
  'vibe',
  'information',
  'wisdom',
  'handoff',
  'telephony',
  'voice-enrollment',
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
  'simple-utilities',
  // Life Coaching Domains
  'crisis',
  'health',
  'career',
  'decisions',
  'family',
  'home',
  'learning',
  'creativity',
  'community',
  'legal-admin',
  'games',
  'cameo',
  'group-conversation',
  'second-chances',
  'connection',
  'difficult-conversations',
  'life-transitions',
  'reflection-games',
  'quiet-growth',
  'pattern-mastery',
  'timeless-perspective',
  'workflow-mastery',
  'life-thesis',
  'habit-persistence',
  'milestone-mastery',
  'developer',
  'behavior',
  'marketing',
  'referral',
  'smart-home',
  'webhooks',
  'books',
  'podcasts',
  'video',
  // New Life Coaching Domains (Expansion)
  'boundaries',
  'social-skills',
  'body-relationship',
  'anger',
  'shame',
  'envy',
  'resentment',
  'caregiver',
  'divorce',
  'new-parent',
  'empty-nest',
  'infidelity',
  'health-diagnosis',
  'job-loss',
  'sobriety',
  'sandwich-generation',
  'blended-family',
  'coming-out',
  'faith-transition',
  'dating',
  'neurodiversity',
  'trauma-support',
  'procrastination',
  'digital-wellness',
  'perfectionism',
  'intimacy',
  'burnout-recovery',
  'chronic-conditions',
  'midlife',
  'breakup-recovery',
  'scheduling',
  'concierge',
  'travel',
  'settings',
  'insights',
  // Nayan's Superhuman Wisdom
  'nayan-wisdom',
  // Maya's Superhuman Coaching
  'maya-coaching',
  // Alex's Superhuman Communication
  'superhuman-communication',
  // Jordan's Superhuman Planning
  'jordan-planning',
  // Peter's Superhuman Analytics
  'peter-analytics',
  // Local Search
  'local-search',
  // Developer Platform
  'developer-custom',
  // Life Automation Domains
  'commerce',
  'documents',
  'email-intelligence',
  'meal-planning',
  'projects',
  'social-events',
  'transportation',
  'vehicle',
  'workflows',
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
  'voice-enrollment': 'core', // Voice enrollment for phone callers
  habits: 'lifestyle',
  wellness: 'lifestyle',
  'life-planning': 'lifestyle',
  finance: 'financial',
  research: 'financial',
  information: 'information',
  wisdom: 'information',
  entertainment: 'entertainment',
  vibe: 'entertainment', // Unified environment control
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
  'simple-utilities': 'core', // Everyday helpers should be available to all
  // Life Coaching domains
  crisis: 'core', // Safety-critical, should be available to all
  health: 'lifestyle',
  career: 'productivity',
  decisions: 'core', // Foundational decision-making support
  family: 'lifestyle',
  home: 'productivity',
  learning: 'productivity',
  creativity: 'entertainment',
  community: 'lifestyle',
  'legal-admin': 'productivity',
  games: 'entertainment',
  cameo: 'core', // Team cameos should be available to coordinators
  'group-conversation': 'core', // Team roundtables and conference calls
  'second-chances': 'lifestyle', // Core to Ferni's identity - fresh starts and rebuilding
  connection: 'lifestyle', // Loneliness, friendship, belonging - epidemic-level need
  'difficult-conversations': 'lifestyle', // Preparing for and having hard conversations with grace
  'life-transitions': 'lifestyle', // Emotional journey through major life changes
  'reflection-games': 'lifestyle', // Deep coaching games for self-discovery
  'quiet-growth': 'lifestyle', // Anti-hustle growth: rest, seasons, plateaus, sufficiency
  'pattern-mastery': 'information', // Pattern recognition and insights
  'timeless-perspective': 'information', // Wisdom and philosophy
  'workflow-mastery': 'productivity', // Process optimization
  'habit-persistence': 'lifestyle', // Habit tracking persistence
  'milestone-mastery': 'lifestyle', // Achievement tracking
  developer: 'productivity', // Developer tools for coding and CLI
  behavior: 'core', // Behavior control - core to how Ferni speaks
  'life-thesis': 'lifestyle', // Life thesis - cross-persona motivation capture
  marketing: 'communication', // Social media management and content publishing
  referral: 'communication', // Voice referral calls for viral growth
  'smart-home': 'productivity', // Home Assistant integration for smart home control
  webhooks: 'productivity', // Webhook automations for IFTTT, Zapier, etc.
  books: 'entertainment', // Book tracking, recommendations, reading lists
  podcasts: 'entertainment', // Podcast discovery, listening history
  video: 'entertainment', // Video content recommendations and tracking
  // New Life Coaching Domains (Expansion)
  boundaries: 'lifestyle', // Boundary setting, people pleasing recovery
  'social-skills': 'lifestyle', // Adult friendship, conversation skills
  'body-relationship': 'lifestyle', // Body image healing, intuitive eating
  anger: 'lifestyle', // Anger management and healthy expression
  shame: 'lifestyle', // Understanding and healing from shame
  envy: 'lifestyle', // Understanding and transforming envy
  resentment: 'lifestyle', // Processing and releasing resentments
  caregiver: 'lifestyle', // Supporting caregivers
  divorce: 'lifestyle', // Navigating divorce
  'new-parent': 'lifestyle', // Parenthood transition
  'empty-nest': 'lifestyle', // Kids leaving home
  infidelity: 'lifestyle', // Betrayal recovery
  'health-diagnosis': 'lifestyle', // Chronic illness
  'job-loss': 'lifestyle', // Unemployment support
  sobriety: 'lifestyle', // Recovery support
  'sandwich-generation': 'lifestyle', // Multi-gen caregiving
  'blended-family': 'lifestyle', // Step-families
  'coming-out': 'lifestyle', // LGBTQ+ identity
  'faith-transition': 'lifestyle', // Spiritual changes
  dating: 'lifestyle', // Modern dating navigation
  neurodiversity: 'lifestyle', // ADHD, autism support
  'trauma-support': 'lifestyle', // Trauma-informed support
  procrastination: 'productivity', // Overcoming procrastination
  'digital-wellness': 'lifestyle', // Healthy tech relationship
  perfectionism: 'lifestyle', // Perfectionism and imposter syndrome
  intimacy: 'lifestyle', // Sexual wellness and intimacy
  'burnout-recovery': 'lifestyle', // Recovering from burnout
  'chronic-conditions': 'lifestyle', // Living well with chronic illness
  midlife: 'lifestyle', // Midlife transitions and aging
  'breakup-recovery': 'lifestyle', // Healing from relationship endings
  scheduling: 'communication', // Scheduled messages, calls, emails
  concierge: 'communication', // AI-powered outreach: hotels, restaurants, appointments
  travel: 'lifestyle', // Travel planning, flights, hotels
  settings: 'core', // User preferences: language, voice, session settings
  insights: 'core', // Analytics summaries, progress tracking, weekly reviews
  // Nayan's Superhuman Wisdom
  'nayan-wisdom': 'information', // Nayan's superhuman wisdom tools (paradox keeper, mortality perspective, etc.)
  'maya-coaching': 'lifestyle', // Maya's superhuman coaching tools (habit DNA, friction mapping, etc.)
  'superhuman-communication': 'communication', // Alex's 10 superhuman communication capabilities
  'jordan-planning': 'lifestyle', // Jordan's superhuman planning tools
  'peter-analytics': 'information', // Peter's superhuman analytics tools
  'local-search': 'information', // Local search for nearby restaurants, services, places
  // Developer Platform
  'developer-custom': 'core', // API-registered custom tools from Developer Platform
  // Life Automation Domains
  commerce: 'productivity', // Grocery ordering, subscription management
  documents: 'productivity', // Receipts, warranties, IDs, expiration tracking
  'email-intelligence': 'communication', // Email prioritization, follow-ups, unsubscribe
  'meal-planning': 'lifestyle', // Recipes, weekly plans, shopping lists
  projects: 'productivity', // Multi-task projects with templates
  'social-events': 'lifestyle', // Birthdays, anniversaries, gift tracking
  transportation: 'lifestyle', // Uber/Lyft rides, commute tracking
  vehicle: 'lifestyle', // Maintenance schedules, registration alerts
  workflows: 'productivity', // Custom automations, IFTTT-style triggers
  routines: 'lifestyle', // Ferni's care routines - "What I Do For You"
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
  | 'sonos' // Sonos speakers
  | 'sendgrid' // Email service
  | 'twilio' // SMS/phone service
  | 'openweather' // Weather API
  | 'newsapi' // News aggregation
  | 'alpha-vantage' // Stock data
  | 'finnhub' // Financial data
  | 'firebase' // Firestore/Auth
  | 'ecobee'; // Ecobee thermostat

// ============================================================================
// TOOL DEFINITION
// ============================================================================

/**
 * Configuration passed to tool factory functions
 */
export interface ToolContext {
  /** Current user ID */
  userId: string;

  /** Current session ID (for stateful operations like cameos) */
  sessionId?: string;

  /** Agent ID using this tool */
  agentId: string;

  /** Agent's display name */
  agentDisplayName: string;

  /** Agent's manifest configuration */
  agentManifest?: AgentManifestRef;

  /** Initialized external services (defaults to EnvironmentServiceRegistry if not provided) */
  services?: ServiceRegistry;

  /** Optional domain-specific configuration from manifest */
  domainConfig?: Record<string, unknown>;

  /**
   * User's detected location from IP geolocation (TikTok-style personalization)
   * Used for weather defaults, local content hints, topic suggestions
   */
  userLocation?: {
    city?: string;
    regionCode?: string; // State/province
    countryCode?: string;
  };
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
  has: (service: ExternalService) => boolean;

  /** Get service instance (throws if not available) */
  get: <T>(service: ExternalService) => T;

  /** Get service instance or undefined */
  getOptional: <T>(service: ExternalService) => T | undefined;
}

/**
 * Base tool interface for strict custom implementations
 *
 * Use this interface when you want TypeScript to validate your tool structure.
 */
export interface StrictToolInterface {
  /** Description shown to the LLM */
  description: string;

  /**
   * Parameter schema - can be JSON Schema or Zod schema
   * Optional when tool takes no parameters
   */
  parameters?: unknown;

  /**
   * Execute the tool with provided parameters
   * Returns string for simple responses, or object for structured data
   */
  execute: (params: Record<string, unknown>) => Promise<unknown>;

  /** Tool name (optional, defaults to ID) */
  name?: string;
}

/**
 * Strict tool interface for our custom implementations.
 *
 * Use this when building tools that need full type safety.
 * For LiveKit compatibility, use the flexible `Tool` type instead.
 */
export interface BaseTool {
  /** Description shown to the LLM */
  description: string;

  /**
   * Execute the tool with provided parameters.
   * Returns string for simple responses, or object for structured data.
   */
  execute: (params: Record<string, unknown>) => Promise<unknown>;

  /**
   * Parameter schema - can be JSON Schema or Zod schema.
   * Optional when tool takes no parameters.
   */
  parameters?: unknown;

  /** Tool name (optional, defaults to ID) */
  name?: string;
}

/**
 * A callable tool function (LiveKit agents compatible)
 *
 * This type is intentionally flexible to accommodate:
 * 1. LiveKit's FunctionTool with complex generic signatures
 * 2. Our custom tool implementations
 * 3. Third-party tool formats
 *
 * The flexibility is necessary because:
 * - LiveKit FunctionTool has a complex generic signature
 * - Different tool formats have different execute() signatures
 * - JSON Schema and Zod parameters are not directly compatible
 *
 * For strict typing in custom implementations, use `BaseTool` interface.
 * Use `isTool()` type guard to validate unknown objects.
 * Use `assertTool()` to throw if validation fails.
 *
 * NOTE: This uses a permissive type to avoid breaking existing code.
 * Tools should still implement description and execute at minimum.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Tool = any;

/**
 * Type guard to check if an object has the minimum Tool structure
 */
export function isTool(obj: unknown): obj is Tool {
  if (typeof obj !== 'object' || obj === null) return false;
  const tool = obj as Record<string, unknown>;
  return typeof tool.description === 'string' && typeof tool.execute === 'function';
}

/**
 * Assert that an object is a valid Tool, throwing if not
 */
export function assertTool(obj: unknown, name = 'tool'): asserts obj is Tool {
  if (!isTool(obj)) {
    throw new Error(
      `${name} must be a valid Tool with 'description' (string) and 'execute' (function)`
    );
  }
}

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
  create: (_ctx: ToolContext) => Tool;

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

/**
 * Environment-based service registry
 *
 * Checks environment variables to determine if services are available.
 * Use this instead of EmptyServiceRegistry to enable tools that require
 * external services like Twilio, Plaid, etc.
 */
export class EnvironmentServiceRegistry implements ServiceRegistry {
  private serviceChecks: Record<ExternalService, () => boolean> = {
    twilio: () => !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
    plaid: () => !!(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET),
    'google-calendar': () => !!process.env.GOOGLE_CALENDAR_CREDENTIALS,
    'google-contacts': () => !!process.env.GOOGLE_CONTACTS_CREDENTIALS,
    spotify: () => !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET),
    sonos: () => !!(process.env.SONOS_CLIENT_ID && process.env.SONOS_CLIENT_SECRET),
    sendgrid: () => !!process.env.SENDGRID_API_KEY,
    openweather: () => !!process.env.OPENWEATHER_API_KEY,
    newsapi: () => !!process.env.NEWS_API_KEY,
    'alpha-vantage': () => !!process.env.ALPHA_VANTAGE_API_KEY,
    finnhub: () => !!process.env.FINNHUB_API_KEY,
    firebase: () => !!process.env.GOOGLE_CLOUD_PROJECT,
    ecobee: () => !!process.env.ECOBEE_API_KEY,
  };

  has(service: ExternalService): boolean {
    const check = this.serviceChecks[service];
    return check ? check() : false;
  }

  get<T>(service: ExternalService): T {
    if (!this.has(service)) {
      throw new Error(`Service not available: ${service}`);
    }
    // Services would be instantiated here in a full implementation
    throw new Error(`Service ${service} not implemented in get()`);
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
  EnvironmentServiceRegistry,
};
// CI trigger: 1765115360
