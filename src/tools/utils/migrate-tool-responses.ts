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

import { getLogger } from '../../utils/safe-logger.js';
import type { Tool, ToolDefinition, ToolContext } from '../registry/types.js';
import { formatForLLM, fromLegacyResponse, type ToolResponse } from './tool-response.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

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

// ============================================================================
// STATE
// ============================================================================

const migrationTracker = new Set<string>();
const migrationStats: MigrationStats = {
  totalProcessed: 0,
  alreadyMigrated: 0,
  newlyMigrated: 0,
  errors: [],
};

// ============================================================================
// DETECTION
// ============================================================================

/**
 * Check if a result is already in ToolResponse format
 */
function isToolResponse(result: unknown): result is ToolResponse {
  if (!result || typeof result !== 'object') return false;
  const obj = result as Record<string, unknown>;
  return (
    'success' in obj &&
    typeof obj.success === 'boolean' &&
    'summary' in obj &&
    typeof obj.summary === 'string' &&
    'timestamp' in obj
  );
}

/**
 * Check if a tool has been marked as migrated
 */
export function isToolMigrated(toolId: string): boolean {
  return migrationTracker.has(toolId);
}

/**
 * Mark a tool as migrated
 */
export function markToolMigrated(toolId: string): void {
  migrationTracker.add(toolId);
}

// ============================================================================
// MIGRATION FUNCTIONS
// ============================================================================

/**
 * Wrap a legacy execute function to return standardized ToolResponse
 */
export function migrateExecuteFunction(
  toolId: string,
  originalExecute: (
    params: Record<string, unknown>,
    context?: { ctx: ToolContext }
  ) => Promise<unknown>,
  options: MigrationOptions = {}
): (params: Record<string, unknown>, context?: { ctx: ToolContext }) => Promise<string> {
  const { enableLogging = false, trackMigrations = true } = options;

  if (trackMigrations) {
    markToolMigrated(toolId);
    migrationStats.newlyMigrated++;
  }

  return async (
    params: Record<string, unknown>,
    context?: { ctx: ToolContext }
  ): Promise<string> => {
    migrationStats.totalProcessed++;

    try {
      const result = await originalExecute(params, context);

      // Check if already ToolResponse
      if (isToolResponse(result)) {
        if (enableLogging) {
          log.debug({ toolId }, 'Tool already returns ToolResponse format');
        }
        migrationStats.alreadyMigrated++;
        return formatForLLM(result);
      }

      // Convert legacy response
      const toolResponse = fromLegacyResponse(result, toolId);

      if (enableLogging) {
        log.debug(
          {
            toolId,
            originalType: typeof result,
            converted: toolResponse.success,
          },
          'Legacy response converted to ToolResponse'
        );
      }

      return formatForLLM(toolResponse);
    } catch (error) {
      const errorMsg = `Migration error for ${toolId}: ${String(error)}`;
      migrationStats.errors.push(errorMsg);

      if (enableLogging) {
        log.warn({ toolId, error: String(error) }, 'Error during tool response migration');
      }

      // Still return a user-friendly response
      return `I ran into an issue. Let me try a different approach.`;
    }
  };
}

/**
 * Migrate a tool definition to use standardized responses
 */
export function migrateToolDefinition(
  definition: ToolDefinition,
  options: MigrationOptions = {}
): ToolDefinition {
  const originalCreate = definition.create;

  return {
    ...definition,
    create: (ctx: ToolContext): Tool => {
      const originalTool = originalCreate(ctx);

      // Get the execute function
      const originalExecute = originalTool.execute as (
        params: Record<string, unknown>,
        context?: { ctx: ToolContext }
      ) => Promise<unknown>;

      // Wrap it with migration
      const migratedExecute = migrateExecuteFunction(definition.id, originalExecute, options);

      return {
        ...originalTool,
        execute: migratedExecute,
      };
    },
  };
}

/**
 * Migrate multiple tool definitions
 */
export function migrateToolDefinitions(
  definitions: ToolDefinition[],
  options: MigrationOptions = {}
): ToolDefinition[] {
  const { domains = [], toolIds = [], skipAlreadyMigrated = true } = options;

  return definitions.map((def) => {
    // Skip if already migrated
    if (skipAlreadyMigrated && isToolMigrated(def.id)) {
      return def;
    }

    // Filter by domain if specified
    if (domains.length > 0 && !domains.includes(def.domain)) {
      return def;
    }

    // Filter by tool ID if specified
    if (toolIds.length > 0 && !toolIds.includes(def.id)) {
      return def;
    }

    return migrateToolDefinition(def, options);
  });
}

/**
 * Migrate a record of tools (keyed by tool name)
 */
export function migrateToolRecord(
  tools: Record<string, Tool>,
  options: MigrationOptions = {}
): Record<string, Tool> {
  const migrated: Record<string, Tool> = {};

  for (const [name, tool] of Object.entries(tools)) {
    const originalExecute = tool.execute as (
      params: Record<string, unknown>,
      context?: { ctx: ToolContext }
    ) => Promise<unknown>;

    migrated[name] = {
      ...tool,
      execute: migrateExecuteFunction(name, originalExecute, options),
    };
  }

  return migrated;
}

// ============================================================================
// STATISTICS
// ============================================================================

/**
 * Get migration statistics
 */
export function getMigrationStats(): MigrationStats {
  return { ...migrationStats };
}

/**
 * Get list of migrated tool IDs
 */
export function getMigratedToolIds(): string[] {
  return Array.from(migrationTracker);
}

/**
 * Reset migration tracking (for testing)
 */
export function resetMigrationTracking(): void {
  migrationTracker.clear();
  migrationStats.totalProcessed = 0;
  migrationStats.alreadyMigrated = 0;
  migrationStats.newlyMigrated = 0;
  migrationStats.errors = [];
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  migrateExecuteFunction,
  migrateToolDefinition,
  migrateToolDefinitions,
  migrateToolRecord,
  isToolMigrated,
  markToolMigrated,
  getMigrationStats,
  getMigratedToolIds,
  resetMigrationTracking,
};
