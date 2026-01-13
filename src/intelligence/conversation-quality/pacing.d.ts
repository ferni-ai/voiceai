/**
 * Conversation Pacing Module
 *
 * Calculates real-time conversation quality scores based on:
 * - Engagement
 * - Depth
 * - Rapport
 * - Progress
 *
 * @module conversation-quality/pacing
 */
import type { ConversationPacingScore } from './types.js';
/**
 * Calculate real-time conversation quality score
 */
export declare function calculatePacingScore(recentMessages: Array<{
    role: 'user' | 'assistant';
    content: string;
}>, turnCount: number, topicsDiscussed: string[], emotionalMoments: number, goalsReached: number): ConversationPacingScore;
//# sourceMappingURL=pacing.d.ts.map