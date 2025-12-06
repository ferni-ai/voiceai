/**
 * Handoff Domain Tools
 *
 * Tools for agent-to-agent handoffs and team coordination.
 * This domain enables multi-agent collaboration.
 *
 * DOMAIN: handoff
 *
 * IMPORTANT: This domain loads tools asynchronously from the AgentRegistry.
 * The getToolDefinitions() function MUST be called after AgentRegistry is initialized.
 */

import type { ToolDefinition, ToolContext } from '../../registry/types.js';

// Agent-agnostic handoff factory
// NOTE: Path is relative from tools/domains/handoff/ to tools/handoff/
import { createHandoffTools } from '../../handoff/index.js';

// ============================================================================
// HANDOFF TOOLS
// ============================================================================

/**
 * Get handoff tool definitions dynamically from the agent registry.
 * This is the primary function - it loads tools asynchronously.
 */
async function getHandoffToolDefinitionsAsync(): Promise<ToolDefinition[]> {
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

// Cache for loaded tools (populated on first async call)
let cachedHandoffTools: ToolDefinition[] | null = null;

/**
 * Get handoff tool definitions.
 *
 * FIX BUG: This now returns cached tools if available, or an empty array if not yet loaded.
 * The registry loader calls this asynchronously, so tools will be loaded.
 */
async function getToolDefinitions(): Promise<ToolDefinition[]> {
  if (cachedHandoffTools) {
    return cachedHandoffTools;
  }

  // Load and cache the tools
  cachedHandoffTools = await getHandoffToolDefinitionsAsync();
  return cachedHandoffTools;
}

// ============================================================================
// DOMAIN METADATA
// ============================================================================

export const domain = 'handoff';
export const definitions: ToolDefinition[] = []; // Populated async via getToolDefinitions

// ============================================================================
// EXPORTS
// ============================================================================

export { getToolDefinitions };

export default getToolDefinitions;
