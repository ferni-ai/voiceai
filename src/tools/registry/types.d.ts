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
/**
 * Tool domains represent functional areas.
 * Agents select which domains they need in their manifest.
 */
export type ToolDomain = 'memory' | 'calendar' | 'communication' | 'habits' | 'finance' | 'research' | 'productivity' | 'life-planning' | 'wellness' | 'entertainment' | 'vibe' | 'information' | 'wisdom' | 'handoff' | 'telephony' | 'voice-enrollment' | 'grief' | 'meaning' | 'relationships' | 'stories' | 'curiosity' | 'vulnerability' | 'dreams' | 'play' | 'self-compassion' | 'presence' | 'proactive' | 'awareness' | 'engagement' | 'simple-utilities' | 'routines' | 'crisis' | 'health' | 'career' | 'decisions' | 'family' | 'home' | 'learning' | 'creativity' | 'community' | 'legal-admin' | 'games' | 'cameo' | 'group-conversation' | 'second-chances' | 'connection' | 'difficult-conversations' | 'life-transitions' | 'reflection-games' | 'quiet-growth' | 'pattern-mastery' | 'timeless-perspective' | 'workflow-mastery' | 'habit-persistence' | 'milestone-mastery' | 'developer' | 'behavior' | 'life-thesis' | 'marketing' | 'referral' | 'smart-home' | 'webhooks' | 'books' | 'podcasts' | 'video' | 'boundaries' | 'social-skills' | 'body-relationship' | 'anger' | 'shame' | 'envy' | 'resentment' | 'caregiver' | 'divorce' | 'new-parent' | 'empty-nest' | 'infidelity' | 'health-diagnosis' | 'job-loss' | 'sobriety' | 'sandwich-generation' | 'blended-family' | 'coming-out' | 'faith-transition' | 'dating' | 'neurodiversity' | 'trauma-support' | 'procrastination' | 'digital-wellness' | 'perfectionism' | 'intimacy' | 'burnout-recovery' | 'chronic-conditions' | 'midlife' | 'breakup-recovery' | 'scheduling' | 'concierge' | 'travel' | 'settings' | 'insights' | 'nayan-wisdom' | 'maya-coaching' | 'superhuman-communication' | 'jordan-planning' | 'peter-analytics' | 'local-search' | 'developer-custom' | 'commerce' | 'documents' | 'email-intelligence' | 'meal-planning' | 'projects' | 'social-events' | 'transportation' | 'vehicle' | 'workflows';
/**
 * All available tool domains
 */
export declare const ALL_TOOL_DOMAINS: readonly ToolDomain[];
/**
 * High-level categories for tool organization
 */
export type ToolCategory = 'core' | 'productivity' | 'financial' | 'communication' | 'lifestyle' | 'information' | 'entertainment';
/**
 * Mapping from domains to categories
 */
export declare const DOMAIN_TO_CATEGORY: Record<ToolDomain, ToolCategory>;
/**
 * External services that tools may require
 */
export type ExternalService = 'plaid' | 'google-calendar' | 'google-contacts' | 'spotify' | 'sonos' | 'sendgrid' | 'twilio' | 'openweather' | 'newsapi' | 'alpha-vantage' | 'finnhub' | 'firebase' | 'ecobee';
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
        regionCode?: string;
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
export type Tool = any;
/**
 * Type guard to check if an object has the minimum Tool structure
 */
export declare function isTool(obj: unknown): obj is Tool;
/**
 * Assert that an object is a valid Tool, throwing if not
 */
export declare function assertTool(obj: unknown, name?: string): asserts obj is Tool;
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
/**
 * Events emitted by the tool registry
 */
export type RegistryEvent = {
    type: 'tool_registered';
    tool: ToolDefinition;
} | {
    type: 'tool_unregistered';
    toolId: string;
} | {
    type: 'domain_registered';
    domain: ToolDomain;
    toolCount: number;
} | {
    type: 'build_complete';
    agentId: string;
    toolCount: number;
};
export type RegistryEventHandler = (event: RegistryEvent) => void;
/**
 * Validate a tool definition
 */
export declare function validateToolDefinition(def: Partial<ToolDefinition>): string[];
/**
 * Validate a tool set specification
 */
export declare function validateToolSetSpec(spec: Partial<ToolSetSpec>): string[];
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
export declare class EmptyServiceRegistry implements ServiceRegistry {
    has(): boolean;
    get<T>(service: ExternalService): T;
    getOptional<T>(): T | undefined;
}
/**
 * Environment-based service registry
 *
 * Checks environment variables to determine if services are available.
 * Use this instead of EmptyServiceRegistry to enable tools that require
 * external services like Twilio, Plaid, etc.
 */
export declare class EnvironmentServiceRegistry implements ServiceRegistry {
    private serviceChecks;
    has(service: ExternalService): boolean;
    get<T>(service: ExternalService): T;
    getOptional<T>(): T | undefined;
}
declare const _default: {
    ALL_TOOL_DOMAINS: readonly ToolDomain[];
    DOMAIN_TO_CATEGORY: Record<ToolDomain, ToolCategory>;
    validateToolDefinition: typeof validateToolDefinition;
    validateToolSetSpec: typeof validateToolSetSpec;
    EmptyServiceRegistry: typeof EmptyServiceRegistry;
    EnvironmentServiceRegistry: typeof EnvironmentServiceRegistry;
};
export default _default;
//# sourceMappingURL=types.d.ts.map