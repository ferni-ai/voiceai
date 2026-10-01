/**
 * Wraps legacy entertainment tools in registry-compatible definitions.
 * Extracted from entertainment/index.ts.
 */

import type { ToolDefinition, ToolContext, ExternalService } from '../../registry/types.js';

// ============================================================================
// LEGACY TOOL WRAPPER
// ============================================================================

export function wrapLegacyTool(
  id: string,
  name: string,
  description: string,
  legacyTool: unknown,
  options?: {
    tags?: string[];
    requiredServices?: ExternalService[];
  }
): ToolDefinition {
  return {
    id,
    name,
    description,
    domain: 'entertainment',
    tags: ['entertainment', 'music', ...(options?.tags || [])],
    requiredServices: options?.requiredServices,
    create: (_ctx: ToolContext) => legacyTool as any,
  };
}
