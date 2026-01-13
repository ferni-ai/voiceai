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
// Main unified outreach tool
export { createUnifiedOutreachTool, getUnifiedOutreachDefinition, } from './unified-outreach.js';
// Batch outreach for groups
export { createPreviewBatchTool, createSendBatchTool, createOutreachSuggestionsTool, getBatchOutreachDefinitions, } from './batch-outreach.js';
// Multi-target outreach (call/text/email multiple people with scheduling)
export { createMultiOutreachTool, getMultiOutreachDefinition, } from './multi-outreach.js';
// Message crafting
export { craftPersonalizedMessage, craftConversationOpener, craftFollowUpMessage, craftThinkingOfYouMessage, } from './message-crafting.js';
// Combined tool definitions for easy registration
import { getUnifiedOutreachDefinition } from './unified-outreach.js';
import { getBatchOutreachDefinitions } from './batch-outreach.js';
import { getMultiOutreachDefinition } from './multi-outreach.js';
/**
 * Get all outreach tool definitions
 */
export function getOutreachToolDefinitions() {
    return [
        getUnifiedOutreachDefinition(),
        getMultiOutreachDefinition(),
        ...getBatchOutreachDefinitions(),
    ];
}
export default getOutreachToolDefinitions;
//# sourceMappingURL=index.js.map