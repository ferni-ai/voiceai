/**
 * Follow-Up Scheduling Module
 *
 * Extracts and manages follow-up items from conversations
 * to enable proactive future engagement.
 *
 * @module conversation-quality/follow-ups
 */
import type { FollowUpItem } from './types.js';
/**
 * Extract potential follow-up items from conversation
 */
export declare function extractFollowUps(conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
}>, topics: string[]): FollowUpItem[];
/**
 * Generate a follow-up suggestion
 */
export declare function getFollowUpSuggestion(followUp: FollowUpItem): string;
//# sourceMappingURL=follow-ups.d.ts.map