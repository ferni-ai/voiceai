/**
 * Farewell Summary Module
 *
 * Generates summaries for the end of conversations to enable
 * better continuity in future sessions.
 *
 * @module conversation-quality/farewell
 */
import type { FarewellSummary } from './types.js';
/**
 * Generate a farewell summary for the next conversation
 */
export declare function generateFarewellSummary(conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
}>, topicsDiscussed: string[], userProfile: {
    name?: string;
    goals?: Array<{
        type: string;
        status: string;
    }>;
    familyMembers?: Array<{
        name: string;
        relationship: string;
    }>;
} | null, emotionalArc: {
    start: string;
    end: string;
}): FarewellSummary;
//# sourceMappingURL=farewell.d.ts.map