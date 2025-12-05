/**
 * Memory Domain Tools
 *
 * Tools for persistent memory, recall, and cross-session continuity.
 * These allow any agent to remember users across conversations and build relationships.
 *
 * DOMAIN: memory
 * TOOLS:
 *   - rememberAboutUser: Store important facts about the user
 *   - recallFromMemory: Try to recall something from past conversations
 *   - recallPreviousConversation: Semantic search on conversation history
 *   - rememberImportantFact: Save critically important facts
 *   - getRelationshipSummary: Get relationship history with user
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition } from '../../registry/types.js';
import {
  rememberAboutUserDef,
  recallFromMemoryDef,
  recallPreviousConversationDef,
  rememberImportantFactDef,
  getRelationshipSummaryDef,
} from './tools.js';

// ============================================================================
// DOMAIN TOOLS
// ============================================================================

const memoryTools: ToolDefinition[] = [
  rememberAboutUserDef,
  recallFromMemoryDef,
  recallPreviousConversationDef,
  rememberImportantFactDef,
  getRelationshipSummaryDef,
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'memory',
  memoryTools
);

// Export individual tools for selective imports
export {
  rememberAboutUserDef,
  recallFromMemoryDef,
  recallPreviousConversationDef,
  rememberImportantFactDef,
  getRelationshipSummaryDef,
};

export default getToolDefinitions;
