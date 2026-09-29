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
 *
 * FIX (Jan 2026): Use buildHandoffTools() instead of createHandoffTools().
 * createHandoffTools() returns raw HandoffToolDefinition objects with Zod parameters,
 * which OpenAI Realtime API doesn't understand (it needs JSON Schema).
 * buildHandoffTools() properly wraps tools with llm.tool() which handles the conversion.
 */

import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';

// Agent-agnostic handoff factory
// NOTE: Path is relative from tools/domains/handoff/ to tools/handoff/
// FIX: Use buildHandoffTools which returns proper llm.tool() wrapped tools
import { buildHandoffTools, createHandoffTools } from '../../handoff/index.js';
import { isCoach } from '../../../personas/persona-ids.js';

// ============================================================================
// HANDOFF TOOLS
// ============================================================================

/**
 * Get handoff tool definitions dynamically from the agent registry.
 * This is the primary function - it loads tools asynchronously.
 *
 * FIX: buildHandoffTools() creates proper llm.tool() wrapped tools that work
 * with OpenAI Realtime API. createHandoffTools() only returns raw definitions
 * with Zod parameters that don't convert properly to JSON Schema.
 */
async function getHandoffToolDefinitionsAsync(): Promise<ToolDefinition[]> {
  // Get raw definitions for metadata (triggers, agentId, etc.)
  const handoffToolSet = await createHandoffTools();

  // Get properly wrapped llm.tool() tools
  const { tools: wrappedTools } = await buildHandoffTools();

  const definitions: ToolDefinition[] = [];

  for (const toolDef of handoffToolSet.tools) {
    // Teammate handoffs depend on who this user has unlocked, which only the
    // per-session build (tools/builder.ts buildHandoffToolsForAgent) knows.
    // These definitions are built once per process with no profile, so
    // offering them here put locked teammates back in front of the model
    // through the dynamic loader: it promised a handoff to Alex, was
    // refused, and tried again (voice eval, 2026-09-28). Only the hand-back
    // to the coordinator, who is always available, is shared.
    if (!isCoach(toolDef.agentId)) continue;

    // Get the corresponding wrapped tool
    const wrappedTool = wrappedTools[toolDef.name];

    if (!wrappedTool) {
      // Tool was filtered out (e.g., locked team member) - skip it
      continue;
    }

    definitions.push({
      id: toolDef.name,
      name: toolDef.name.replace(/([A-Z])/g, ' $1').trim(), // CamelCase to Title Case
      description: toolDef.description,
      domain: 'handoff',
      tags: ['handoff', 'team', ...(toolDef.handoffTriggers || [])],
      // FIX: Return the properly wrapped tool, not the raw definition
      create: (_ctx: ToolContext) => wrappedTool as Tool,
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
