/**
 * Handoff Domain Tools
 *
 * Tools for agent-to-agent handoffs and team coordination.
 * This domain enables multi-agent collaboration.
 *
 * DOMAIN: handoff
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext } from '../../registry/types.js';

// Agent-agnostic handoff factory
import { buildHandoffTools, createHandoffTools } from '../../handoff/index.js';

// ============================================================================
// HANDOFF TOOLS
// ============================================================================

/**
 * Get handoff tool definitions dynamically from the agent registry.
 */
async function getNewHandoffToolDefinitions(): Promise<ToolDefinition[]> {
  const handoffToolSet = await createHandoffTools();

  const definitions: ToolDefinition[] = [];

  for (const toolDef of handoffToolSet.tools) {
    definitions.push({
      id: toolDef.name,
      name: toolDef.name.replace(/([A-Z])/g, ' $1').trim(), // CamelCase to Title Case
      description: toolDef.description,
      domain: 'handoff',
      tags: ['handoff', 'team', ...(toolDef.handoffTriggers || [])],
      create: (_ctx: ToolContext) => toolDef,
    });
  }

  return definitions;
}

/**
 * Get handoff tool definitions.
 * Returns an empty array synchronously - use getNewHandoffToolDefinitions for async.
 */
function getHandoffToolDefinitions(): ToolDefinition[] {
  // Return empty for sync compatibility - the async version should be used
  return [];
}

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

// Note: This is empty synchronously. Use buildHandoffTools() directly for dynamic tools.
const handoffTools: ToolDefinition[] = [];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'handoff',
  handoffTools
);

export { getHandoffToolDefinitions, getNewHandoffToolDefinitions };

export default getToolDefinitions;
