/**
 * Tool Wrapper Utilities
 *
 * Provides decorators and wrappers to add consistent:
 * - Input validation
 * - Analytics tracking
 * - Error handling with Result types
 * - Performance monitoring
 * - Deprecation warnings
 * - **Self-healing resilience** (retry with backoff)
 *
 * This enables standardizing tool behavior across all domains without
 * modifying each tool individually.
 *
 * USAGE:
 *
 * // Wrap an existing tool definition
 * const wrappedTool = wrapToolDefinition(myToolDef, {
 *   enableAnalytics: true,
 *   enableValidation: true,
 *   enableErrorHandling: true,
 *   enableResilience: true, // NEW: automatic retry
 * });
 *
 * // Or use the factory for new tools
 * const myTool = createEnhancedTool({
 *   id: 'myTool',
 *   domain: 'career',
 *   // ... tool config
 * });
 */
import type { ToolContext, ToolDefinition, ToolDomain } from '../registry/types.js';
/**
 * Standard Result type for tool returns
 */
export type ToolResult<T = unknown> = {
    success: true;
    data: T;
    metadata?: ToolResultMetadata;
} | {
    success: false;
    error: string;
    code?: string;
    metadata?: ToolResultMetadata;
};
export interface ToolResultMetadata {
    executionTimeMs?: number;
    toolId?: string;
    domain?: ToolDomain;
    timestamp?: string;
}
/**
 * Create a success result
 */
export declare function success<T>(data: T, metadata?: ToolResultMetadata): ToolResult<T>;
/**
 * Create an error result
 */
export declare function failure(error: string, code?: string, metadata?: ToolResultMetadata): ToolResult<never>;
export interface WrapperOptions {
    /** Enable analytics tracking */
    enableAnalytics?: boolean;
    /** Enable input validation/sanitization */
    enableValidation?: boolean;
    /** Enable Result type error handling (catch all errors) */
    enableErrorHandling?: boolean;
    /** Enable performance monitoring */
    enablePerformanceTracking?: boolean;
    /** Show deprecation warnings */
    enableDeprecationWarnings?: boolean;
    /**
     * Enable self-healing resilience (retry with backoff)
     * When enabled, transient failures will be automatically retried
     */
    enableResilience?: boolean;
    /** Maximum retry attempts when resilience is enabled (default: 2) */
    maxRetries?: number;
    /** Custom validation function */
    customValidator?: (params: Record<string, unknown>) => {
        valid: boolean;
        error?: string;
    };
    /** Fields to sanitize (text sanitization) */
    sanitizeFields?: string[];
    /** Maximum execution time before warning (ms) */
    slowExecutionThresholdMs?: number;
    /** Custom function to determine if error is retryable */
    shouldRetry?: (error: Error) => boolean;
}
/**
 * Wrap a tool's execute function with additional capabilities
 */
export declare function wrapToolExecute(toolId: string, domain: ToolDomain, originalExecute: (params: Record<string, unknown>, context?: {
    ctx: ToolContext;
}) => Promise<unknown>, ctx: ToolContext, options?: WrapperOptions): (params: Record<string, unknown>, context?: {
    ctx: ToolContext;
}) => Promise<unknown>;
/**
 * Wrap a tool definition to add enhanced capabilities
 */
export declare function wrapToolDefinition(definition: ToolDefinition, options?: WrapperOptions): ToolDefinition;
/**
 * Wrap multiple tool definitions
 */
export declare function wrapToolDefinitions(definitions: ToolDefinition[], options?: WrapperOptions): ToolDefinition[];
export interface EnhancedToolConfig extends Omit<ToolDefinition, 'create'> {
    /** Tool execution function */
    execute: (params: Record<string, unknown>, ctx: ToolContext, execContext?: {
        ctx: ToolContext;
    }) => Promise<unknown>;
    /** Tool description for LLM */
    llmDescription: string;
    /** Parameter schema (Zod or JSON Schema) */
    parameters?: unknown;
    /** Wrapper options */
    wrapperOptions?: WrapperOptions;
}
/**
 * Create an enhanced tool with all wrapper capabilities built in
 */
export declare function createEnhancedTool(config: EnhancedToolConfig): ToolDefinition;
/**
 * Apply wrapper to all tools in a domain
 */
export declare function enhanceDomainTools(domainTools: ToolDefinition[], domainOptions?: WrapperOptions): ToolDefinition[];
declare const _default: {
    wrapToolExecute: typeof wrapToolExecute;
    wrapToolDefinition: typeof wrapToolDefinition;
    wrapToolDefinitions: typeof wrapToolDefinitions;
    createEnhancedTool: typeof createEnhancedTool;
    enhanceDomainTools: typeof enhanceDomainTools;
    success: typeof success;
    failure: typeof failure;
};
export default _default;
//# sourceMappingURL=tool-wrapper.d.ts.map