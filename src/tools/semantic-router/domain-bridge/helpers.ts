/**
 * Bridge Utility Functions
 *
 * Lookup, transform, query, and dynamic registration helpers
 * for the semantic-to-domain tool mapping system.
 *
 * @module tools/semantic-router/domain-bridge/helpers
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { ToolMapping } from './types.js';

const log = createLogger({ module: 'domain-bridge' });

/**
 * Check if a semantic tool has a domain mapping.
 */
export function hasDomainMapping(
  semanticToolId: string,
  toolMappings: Record<string, ToolMapping>
): boolean {
  return semanticToolId in toolMappings;
}

/**
 * Get the domain tool ID for a semantic tool.
 */
export function getDomainToolId(
  semanticToolId: string,
  toolMappings: Record<string, ToolMapping>
): string | undefined {
  return toolMappings[semanticToolId]?.domainToolId;
}

/**
 * Transform arguments from semantic format to domain format.
 */
export function transformArguments(
  semanticToolId: string,
  args: Record<string, unknown>,
  toolMappings: Record<string, ToolMapping>
): Record<string, unknown> {
  const mapping = toolMappings[semanticToolId];
  if (!mapping) return args;

  return mapping.transformArgs ? mapping.transformArgs(args) : args;
}

/**
 * Get all registered semantic-to-domain mappings.
 * Useful for debugging and testing.
 */
export function getAllMappings(
  toolMappings: Record<string, ToolMapping>
): Record<string, ToolMapping> {
  return { ...toolMappings };
}

/**
 * Register a new tool mapping dynamically.
 * Useful for extensions and plugins.
 */
export function registerMapping(
  semanticToolId: string,
  mapping: ToolMapping,
  toolMappings: Record<string, ToolMapping>
): void {
  if (toolMappings[semanticToolId]) {
    log.warn({ semanticToolId }, 'Overwriting existing tool mapping');
  }
  toolMappings[semanticToolId] = mapping;
  log.info({ semanticToolId, domainToolId: mapping.domainToolId }, 'Tool mapping registered');
}

/**
 * Get mapping statistics for debugging.
 */
export function getMappingStats(toolMappings: Record<string, ToolMapping>): {
  total: number;
  totalMappings: number;
  uniqueDomainTools: number;
  categories: number;
  byCategory: Record<string, number>;
} {
  const mappings = Object.keys(toolMappings);
  const byCategory: Record<string, number> = {};
  const domainTools = new Set<string>();

  for (const id of mappings) {
    const category = id.split('_')[0] || 'other';
    byCategory[category] = (byCategory[category] || 0) + 1;
    domainTools.add(toolMappings[id].domainToolId);
  }

  return {
    total: mappings.length,
    totalMappings: mappings.length,
    uniqueDomainTools: domainTools.size,
    categories: Object.keys(byCategory).length,
    byCategory,
  };
}
