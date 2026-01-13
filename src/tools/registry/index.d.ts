/**
 * Tool Registry
 *
 * Central registry for all tools in the system.
 * Tools register themselves by domain/capability, and agents
 * select which domains they need in their manifest.
 *
 * USAGE:
 *
 * // Register a tool
 * toolRegistry.register({
 *   id: 'createAppointment',
 *   name: 'Create Appointment',
 *   domain: 'calendar',
 *   create: (ctx) => ({ ... })
 * });
 *
 * // Build tools for an agent
 * const tools = await toolRegistry.buildToolSet({
 *   domains: ['calendar', 'memory'],
 *   required: ['handoff'],
 *   forbidden: ['dayTrade']
 * }, context);
 */
import { type RegistryEventHandler, type RegistryQueryOptions, type Tool, type ToolCategory, type ToolContext, type ToolDefinition, type ToolDomain, type ToolMetadata, type ToolSetResult, type ToolSetSpec } from './types.js';
export declare class ToolRegistry {
    /** All registered tools */
    private tools;
    /** Index: domain -> tool IDs */
    private domainIndex;
    /** Index: category -> tool IDs */
    private categoryIndex;
    /** Index: tag -> tool IDs */
    private tagIndex;
    /** Event handlers */
    private eventHandlers;
    /** Initialization flag */
    private initialized;
    constructor();
    /**
     * Register a tool definition
     */
    register(definition: ToolDefinition): void;
    /**
     * Register multiple tools at once
     */
    registerAll(definitions: ToolDefinition[]): void;
    /**
     * Unregister a tool
     */
    unregister(toolId: string): boolean;
    private indexByDomain;
    private indexByCategory;
    private indexByTag;
    /**
     * Get a tool definition by ID
     */
    get(toolId: string): ToolDefinition | undefined;
    /**
     * Check if a tool exists
     */
    has(toolId: string): boolean;
    /**
     * Get all tool IDs
     */
    getAllIds(): string[];
    /**
     * Get all tool definitions
     */
    getAll(): ToolDefinition[];
    /**
     * Get tool metadata (without create function)
     */
    getMetadata(toolId: string): ToolMetadata | undefined;
    /**
     * Get all tool metadata
     */
    getAllMetadata(): ToolMetadata[];
    /**
     * Get tools by domain
     */
    getByDomain(domain: ToolDomain): ToolDefinition[];
    /**
     * Get tools by category
     */
    getByCategory(category: ToolCategory): ToolDefinition[];
    /**
     * Get tools by tag
     */
    getByTag(tag: string): ToolDefinition[];
    /**
     * Query tools with filters
     */
    query(options?: RegistryQueryOptions): ToolDefinition[];
    /**
     * Build a tool set from a specification
     */
    buildToolSet(spec: ToolSetSpec, ctx: ToolContext): ToolSetResult;
    /**
     * Build a simple tool set (convenience method)
     */
    buildSimple(domains: ToolDomain[], ctx?: Partial<ToolContext>): Record<string, Tool>;
    /**
     * Subscribe to registry events
     */
    on(handler: RegistryEventHandler): () => void;
    /**
     * Emit an event
     */
    private emit;
    /**
     * Get registry statistics
     */
    getStats(): {
        totalTools: number;
        byDomain: Record<ToolDomain, number>;
        byCategory: Record<ToolCategory, number>;
        experimental: number;
        deprecated: number;
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
     * Clear the registry (for testing)
     */
    clear(): void;
}
/**
 * Global tool registry instance
 */
export declare const toolRegistry: ToolRegistry;
/**
 * Register a tool with the global registry
 */
export declare function registerTool(definition: ToolDefinition): void;
/**
 * Register multiple tools with the global registry
 */
export declare function registerTools(definitions: ToolDefinition[]): void;
/**
 * Get a tool from the global registry
 */
export declare function getTool(toolId: string): ToolDefinition | undefined;
/**
 * Build a tool set from the global registry
 */
export declare function buildToolSet(spec: ToolSetSpec, ctx: ToolContext): ToolSetResult;
export { ALL_TOOL_DOMAINS, assertTool, DOMAIN_TO_CATEGORY, EmptyServiceRegistry, EnvironmentServiceRegistry, isTool, type BaseTool, type RegistryQueryOptions, type Tool, type ToolCategory, type ToolContext, type ToolDefinition, type ToolDomain, type ToolMetadata, type ToolSetResult, type ToolSetSpec, } from './types.js';
export default toolRegistry;
//# sourceMappingURL=index.d.ts.map