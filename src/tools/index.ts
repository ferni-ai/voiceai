/**
 * Tools Module - Clean Architecture
 *
 * Organized collection of all LLM tools for the Voice AI Agent.
 *
 * Architecture:
 *   registry/         - Domain-based tool registry system (PREFERRED)
 *   builder.ts        - Build tools for agents from manifests
 *   utils/            - Shared utilities (generateId, getUserId, formatters)
 *   lifecycle.ts      - Initialization and shutdown
 *   categories.ts     - Tool categorization and documentation
 *   domains/          - Domain-specific tool collections
 *   exports/          - Organized export groups
 *
 * RECOMMENDED USAGE:
 *   // For agents - use manifest-driven tool building
 *   import { buildAgentTools } from './tools/index.js';
 *   const tools = await buildAgentTools('maya-santos');
 *
 *   // For utilities in tool implementations
 *   import { getUserId, generateId, formatCurrency } from './tools/utils/index.js';
 *
 * MIGRATION STATUS:
 *   - Registry system: Active (preferred)
 *   - Legacy create*Tools(): Deprecated, use buildAgentTools() instead
 *   - Persona aliases (createMayaTools, etc.): Deprecated
 *
 * See docs/TOOL_MIGRATION.md for migration guide.
 */

// ============================================================================
// ORGANIZED EXPORTS
// ============================================================================

// Re-export everything from organized export groups
export * from './exports/index.js';

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

import {
  buildAgentTools,
  buildAllTeamTools,
  buildEssentialTools,
  buildToolsForDomains,
} from './builder.js';
import { getToolCategories, getToolDocumentation } from './categories.js';
import { initializeTeamHandlers, shutdownTools } from './lifecycle.js';
import { createToolComposer } from './orchestrator/tool-composer.js';
import { cleanupStaleConversations, getConversationState } from '../services/conversation-thread/conversation-state.js';
import { composeToolResult } from './exports/utilities.js';
import { toolRegistry } from './registry/index.js';
import { initializeToolRegistry } from './registry/loader.js';

export default {
  // Registry-based system
  toolRegistry,
  initializeToolRegistry,
  buildAgentTools,
  buildToolsForDomains,
  buildEssentialTools,
  buildAllTeamTools,

  // Orchestration (human-level conversation)
  createToolComposer,
  composeToolResult,
  getConversationState,
  cleanupStaleConversations,

  // Utilities
  getToolCategories,
  getToolDocumentation,
  initializeTeamHandlers,
  shutdownTools,
};
