/**
 * Memory Domain Tools
 *
 * Tools for persistent memory, recall, and cross-session continuity.
 * These allow any agent to remember users across conversations and build relationships.
 *
 * ARCHITECTURE: All tools now use UnifiedMemoryService as the SINGLE entry point.
 * This ensures consistent timing intelligence, learning feedback, and context enrichment.
 *
 * DOMAIN: memory
 * TOOLS:
 *   - rememberAboutUser: Store important facts about the user
 *   - recallFromMemory: Try to recall something from past conversations
 *   - recallPreviousConversation: Semantic search on conversation history
 *   - rememberImportantFact: Save critically important facts
 *   - getRelationshipSummary: Get relationship history with user
 *   - updateMemory: Update an existing memory with new/corrected information
 *   - forgetMemory: Remove something from memory when user requests
 *
 * BETTER-THAN-HUMAN TOOLS:
 *   - surfaceRelevantMemory: Proactively surface relevant memories when context connects
 *   - predictUserNeed: Anticipate what the user might need before they ask
 */
import type { ToolDefinition } from '../../registry/types.js';
import { rememberAboutUserUnifiedDef as rememberAboutUserDef, recallFromMemoryUnifiedDef as recallFromMemoryDef, recallPreviousConversationUnifiedDef as recallPreviousConversationDef, rememberImportantFactUnifiedDef as rememberImportantFactDef, surfaceRelevantMemoryUnifiedDef as surfaceRelevantMemoryDef, predictUserNeedUnifiedDef as predictUserNeedDef } from './tools-unified.js';
import { getRelationshipSummaryDef, updateMemoryDef, forgetMemoryDef } from './tools.js';
export declare const getToolDefinitions: () => Promise<ToolDefinition[]>, domain: import("../../registry/types.js").ToolDomain, definitions: ToolDefinition[];
export { rememberAboutUserDef, recallFromMemoryDef, recallPreviousConversationDef, rememberImportantFactDef, getRelationshipSummaryDef, updateMemoryDef, forgetMemoryDef, surfaceRelevantMemoryDef, predictUserNeedDef, };
export { createFerniMemoryTools, createBogleMemoryTools, createPeterMemoryTools, createMayaMemoryTools, createJordanMemoryTools, createAlexMemoryTools, createMemoryManagementTools, } from './persona-tools.js';
export default getToolDefinitions;
//# sourceMappingURL=index.d.ts.map