/**
 * Batch Outreach Tools - Group & Seasonal Messaging
 *
 * For when you need to reach multiple people at once, but still
 * want each message to feel personal. Think:
 * - Holiday greetings to your whole family
 * - Birthday wishes to a friend group
 * - Thank you notes after an event
 * - Seasonal check-ins with important contacts
 *
 * "Better than Human" because:
 * - Each message is personalized to the recipient
 * - No one gets a generic mass message
 * - We track who's already been contacted
 * - Suggests who might need to hear from you
 */
import type { ToolContext, ToolDefinition, Tool } from '../../../registry/types.js';
export type BatchOccasion = 'christmas' | 'new_year' | 'thanksgiving' | 'birthday_wishes' | 'thank_you' | 'check_in' | 'announcement' | 'custom';
export declare function createPreviewBatchTool(ctx: ToolContext): Tool;
export declare function createSendBatchTool(ctx: ToolContext): Tool;
export declare function createOutreachSuggestionsTool(ctx: ToolContext): Tool;
export declare function getBatchOutreachDefinitions(): ToolDefinition[];
export default getBatchOutreachDefinitions;
//# sourceMappingURL=batch-outreach.d.ts.map