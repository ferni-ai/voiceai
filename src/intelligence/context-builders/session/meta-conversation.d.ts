/**
 * Meta-Conversation Context Builder
 *
 * Enables the agent to reflect on the conversation itself:
 * - "I noticed you've been quieter today than usual"
 * - "We keep coming back to this topic—it seems important to you"
 * - "You seem more energized today"
 *
 * This creates a layer of conversational awareness that makes
 * the agent feel more present and observant.
 */
import { type ContextBuilder } from '../index.js';
import type { UserProfile } from '../../../types/user-profile.js';
interface ConversationPattern {
    type: 'topic_repetition' | 'energy_change' | 'verbosity_change' | 'emotional_shift' | 'engagement_drop' | 'opening_up';
    observation: string;
    reflection: string;
    confidence: number;
}
/**
 * Detect recurring topic across sessions
 */
declare function detectTopicRepetition(currentTopics: string[], profile: UserProfile | null): ConversationPattern | null;
/**
 * Detect emotional shift within session
 */
declare function detectEmotionalShift(currentEmotion: string, emotionalHistory: Array<{
    emotion: string;
    turn: number;
}>): ConversationPattern | null;
/**
 * Build meta-conversation context injections
 */
declare const metaConversationBuilder: ContextBuilder;
export { metaConversationBuilder, detectTopicRepetition, detectEmotionalShift };
//# sourceMappingURL=meta-conversation.d.ts.map