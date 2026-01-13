/**
 * Outreach Tools - Unified "Better than Human" Communication
 *
 * This module consolidates all outreach functionality:
 * - unified-outreach.ts: THE tool for reaching out to anyone (reachOut)
 * - batch-outreach.ts: Group & seasonal messaging
 * - message-crafting.ts: LLM-powered personalization
 *
 * REPLACES:
 * - enhanced-outreach-tools.ts
 * - personalized-outreach-tools.ts
 * - Most of communication-tools.ts
 *
 * Philosophy:
 * Users shouldn't have to think about channels, timing, or phrasing.
 * They say "reach out to Mom" and we handle everything.
 */
export { createUnifiedOutreachTool, getUnifiedOutreachDefinition, type OutreachIntent, type Channel, type OutreachContext, type OutreachDecision, type OutreachResult, } from './unified-outreach.js';
export { createPreviewBatchTool, createSendBatchTool, createOutreachSuggestionsTool, getBatchOutreachDefinitions, type BatchOccasion, } from './batch-outreach.js';
export { createMultiOutreachTool, getMultiOutreachDefinition, type OutreachTarget, type TargetResult, type MultiOutreachResult, } from './multi-outreach.js';
export { craftPersonalizedMessage, craftConversationOpener, craftFollowUpMessage, craftThinkingOfYouMessage, type MessageCraftingContext, } from './message-crafting.js';
import type { ToolDefinition } from '../../../registry/types.js';
/**
 * Get all outreach tool definitions
 */
export declare function getOutreachToolDefinitions(): ToolDefinition[];
export default getOutreachToolDefinitions;
//# sourceMappingURL=index.d.ts.map