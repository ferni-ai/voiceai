/**
 * Engagement Context Builder
 *
 * Handles user engagement and connection:
 * - Curiosity moments (ask follow-up questions)
 * - Conversation depth awareness
 * - User engagement detection
 * - Running jokes with returning users
 *
 * These deepen the human connection.
 *
 * Extracted from jack-bogle.ts lines 919-937, 1272-1283, 1332-1356
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
type ConversationDepth = 'deep' | 'medium' | 'surface';
/**
 * Calculate conversation depth
 */
declare function getConversationDepth(turnCount: number, topicsDiscussed: string[], emotionalMomentCount: number): ConversationDepth;
/**
 * Build engagement-related context injections
 */
declare function buildEngagementContext(input: ContextBuilderInput): ContextInjection[];
export { buildEngagementContext, getConversationDepth };
//# sourceMappingURL=engagement.d.ts.map