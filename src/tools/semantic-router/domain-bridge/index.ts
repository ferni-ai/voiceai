/**
 * Domain Bridge — Semantic-to-Domain Tool Mapping
 *
 * Maps ~880+ semantic tool IDs to actual domain tool implementations.
 * Split from a 3,627-line monolith into focused submodules.
 *
 * @module tools/semantic-router/domain-bridge
 */

// Re-export the shared type
export type { ToolMapping } from './types.js';

// Import all mapping partitions
import { CORE_MAPPINGS } from './mappings-core.js';
import { PRODUCTIVITY_MAPPINGS } from './mappings-productivity.js';
import { WELLNESS_MAPPINGS } from './mappings-wellness.js';
import { SPECIALIZED_MAPPINGS } from './mappings-specialized.js';
import { LIFESTYLE_MAPPINGS } from './mappings-lifestyle.js';
import { GROWTH_MAPPINGS } from './mappings-growth.js';
import { MISC_MAPPINGS } from './mappings-misc.js';

// Import logic modules
import type { ToolMapping } from './types.js';
import type { ToolExecutionContext, ToolExecutionResult } from '../types.js';
import {
  hasDomainMapping as _hasDomainMapping,
  getDomainToolId as _getDomainToolId,
  transformArguments as _transformArguments,
  getAllMappings as _getAllMappings,
  registerMapping as _registerMapping,
  getMappingStats as _getMappingStats,
} from './helpers.js';
import { executeDomainTool as _executeDomainTool } from './executor.js';

// Re-export fallback utilities for testing/advanced usage
export { FALLBACK_RESPONSES, generateFallbackResponse } from './fallbacks.js';

// ==========================================================================
// MERGED TOOL MAPPINGS (single mutable record — registerMapping can add to it)
// ==========================================================================

// eslint-disable-next-line prefer-const -- registerMapping() mutates this
let TOOL_MAPPINGS: Record<string, ToolMapping> = {
  ...CORE_MAPPINGS,
  ...PRODUCTIVITY_MAPPINGS,
  ...WELLNESS_MAPPINGS,
  ...SPECIALIZED_MAPPINGS,
  ...LIFESTYLE_MAPPINGS,
  ...GROWTH_MAPPINGS,
  ...MISC_MAPPINGS,
};

// ==========================================================================
// PUBLIC API — backward-compatible wrappers that close over TOOL_MAPPINGS
// ==========================================================================

/**
 * Check if a semantic tool has a domain mapping.
 */
export function hasDomainMapping(semanticToolId: string): boolean {
  return _hasDomainMapping(semanticToolId, TOOL_MAPPINGS);
}

/**
 * Get the domain tool ID for a semantic tool.
 */
export function getDomainToolId(semanticToolId: string): string | undefined {
  return _getDomainToolId(semanticToolId, TOOL_MAPPINGS);
}

/**
 * Transform arguments from semantic format to domain format.
 */
export function transformArguments(
  semanticToolId: string,
  args: Record<string, unknown>
): Record<string, unknown> {
  return _transformArguments(semanticToolId, args, TOOL_MAPPINGS);
}

/**
 * Execute a domain tool via the semantic router bridge.
 */
export async function executeDomainTool(
  semanticToolId: string,
  args: Record<string, unknown>,
  context: Omit<ToolExecutionContext, 'originalText' | 'confidence'>
): Promise<ToolExecutionResult> {
  return _executeDomainTool(semanticToolId, args, context, TOOL_MAPPINGS);
}

/**
 * Get all registered semantic-to-domain mappings.
 */
export function getAllMappings(): Record<string, ToolMapping> {
  return _getAllMappings(TOOL_MAPPINGS);
}

/**
 * Register a new tool mapping dynamically.
 */
export function registerMapping(semanticToolId: string, mapping: ToolMapping): void {
  _registerMapping(semanticToolId, mapping, TOOL_MAPPINGS);
}

/**
 * Get mapping statistics for debugging.
 */
export function getMappingStats(): {
  total: number;
  totalMappings: number;
  uniqueDomainTools: number;
  categories: number;
  byCategory: Record<string, number>;
} {
  return _getMappingStats(TOOL_MAPPINGS);
}
