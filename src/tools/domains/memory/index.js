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
import { createDomainExport } from '../../registry/loader.js';
// Use UNIFIED tools that go through UnifiedMemoryService
import { rememberAboutUserUnifiedDef as rememberAboutUserDef, recallFromMemoryUnifiedDef as recallFromMemoryDef, recallPreviousConversationUnifiedDef as recallPreviousConversationDef, rememberImportantFactUnifiedDef as rememberImportantFactDef, surfaceRelevantMemoryUnifiedDef as surfaceRelevantMemoryDef, predictUserNeedUnifiedDef as predictUserNeedDef, } from './tools-unified.js';
// Keep legacy tools that aren't unified yet
import { getRelationshipSummaryDef, updateMemoryDef, forgetMemoryDef } from './tools.js';
// ============================================================================
// DOMAIN TOOLS
// ============================================================================
const memoryTools = [
    rememberAboutUserDef,
    recallFromMemoryDef,
    recallPreviousConversationDef,
    rememberImportantFactDef,
    getRelationshipSummaryDef,
    updateMemoryDef,
    forgetMemoryDef,
    // Better-Than-Human proactive tools
    surfaceRelevantMemoryDef,
    predictUserNeedDef,
];
// ============================================================================
// EXPORTS
// ============================================================================
export const { getToolDefinitions, domain, definitions } = createDomainExport('memory', memoryTools);
// Export individual tools for selective imports
export { rememberAboutUserDef, recallFromMemoryDef, recallPreviousConversationDef, rememberImportantFactDef, getRelationshipSummaryDef, updateMemoryDef, forgetMemoryDef, 
// Better-Than-Human proactive tools
surfaceRelevantMemoryDef, predictUserNeedDef, };
// Re-export persona-specific memory tools
export { createFerniMemoryTools, createBogleMemoryTools, createPeterMemoryTools, createMayaMemoryTools, createJordanMemoryTools, createAlexMemoryTools, createMemoryManagementTools, } from './persona-tools.js';
export default getToolDefinitions;
//# sourceMappingURL=index.js.map