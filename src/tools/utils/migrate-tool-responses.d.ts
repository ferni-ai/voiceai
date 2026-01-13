/**
 * Tool Response Migration Utility
 *
 * Helps migrate existing tools to use the standardized ToolResponse format.
 * This utility wraps legacy tool execute functions to automatically convert
 * their responses to the new format.
 *
 * USAGE:
 *
 * // Option 1: Wrap individual execute functions
 * import { migrateExecuteFunction } from './migrate-tool-responses.js';
 *
 * const wrappedExecute = migrateExecuteFunction(
 *   'myToolId',
 *   originalExecuteFunction,
 *   { enableLogging: true }
 * );
 *
 * // Option 2: Wrap entire tool definitions
 * import { migrateToolDefinitions } from './migrate-tool-responses.js';
 *
 * const migratedTools = migrateToolDefinitions(legacyTools, {
 *   domains: ['memory', 'entertainment'],
 * });
 */
import type { Tool, ToolDefinition, ToolContext } from '../registry/types.js';
export interface MigrationOptions {
    /** Enable logging of migrations */
    enableLogging?: boolean;
    /** Track which tools have been migrated */
    trackMigrations?: boolean;
    /** Domains to migrate (empty = all) */
    domains?: string[];
    /** Specific tool IDs to migrate (empty = all in domains) */
    toolIds?: string[];
    /** Skip tools that already return ToolResponse format */
    skipAlreadyMigrated?: boolean;
}
interface MigrationStats {
    totalProcessed: number;
    alreadyMigrated: number;
    newlyMigrated: number;
    errors: string[];
}
/**
 * Check if a tool has been marked as migrated
 */
export declare function isToolMigrated(toolId: string): boolean;
/**
 * Mark a tool as migrated
 */
export declare function markToolMigrated(toolId: string): void;
/**
 * Wrap a legacy execute function to return standardized ToolResponse
 */
export declare function migrateExecuteFunction(toolId: string, originalExecute: (params: Record<string, unknown>, context?: {
    ctx: ToolContext;
}) => Promise<unknown>, options?: MigrationOptions): (params: Record<string, unknown>, context?: {
    ctx: ToolContext;
}) => Promise<string>;
/**
 * Migrate a tool definition to use standardized responses
 */
export declare function migrateToolDefinition(definition: ToolDefinition, options?: MigrationOptions): ToolDefinition;
/**
 * Migrate multiple tool definitions
 */
export declare function migrateToolDefinitions(definitions: ToolDefinition[], options?: MigrationOptions): ToolDefinition[];
/**
 * Migrate a record of tools (keyed by tool name)
 */
export declare function migrateToolRecord(tools: Record<string, Tool>, options?: MigrationOptions): Record<string, Tool>;
/**
 * Get migration statistics
 */
export declare function getMigrationStats(): MigrationStats;
/**
 * Get list of migrated tool IDs
 */
export declare function getMigratedToolIds(): string[];
/**
 * Reset migration tracking (for testing)
 */
export declare function resetMigrationTracking(): void;
declare const _default: {
    migrateExecuteFunction: typeof migrateExecuteFunction;
    migrateToolDefinition: typeof migrateToolDefinition;
    migrateToolDefinitions: typeof migrateToolDefinitions;
    migrateToolRecord: typeof migrateToolRecord;
    isToolMigrated: typeof isToolMigrated;
    markToolMigrated: typeof markToolMigrated;
    getMigrationStats: typeof getMigrationStats;
    getMigratedToolIds: typeof getMigratedToolIds;
    resetMigrationTracking: typeof resetMigrationTracking;
};
export default _default;
//# sourceMappingURL=migrate-tool-responses.d.ts.map