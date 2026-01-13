/**
 * Conversation Humanizing Context Builder
 *
 * Uses the ConversationHumanizer orchestrator as the single entry point for all
 * conversation humanization features:
 * - Speech naturalization guidance
 * - Active listening cues
 * - Memory callbacks
 * - Question diversity
 * - Emotional arc tracking
 * - Topic change detection
 *
 * This bridges the conversation module with the LLM prompt injection system.
 *
 * Uses centralized DISTRESS constants for consistent thresholds.
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
interface ConversationHumanizingInput extends ContextBuilderInput {
    personaId: string;
    turnNumber: number;
    wasPersonalSharing?: boolean;
}
/**
 * Build humanization context injections using the unified ConversationHumanizer
 */
export declare function buildConversationHumanizingContext(input: ConversationHumanizingInput): ContextInjection[];
/**
 * Format humanizing guidance for prompt injection
 */
export declare function formatConversationHumanizingForPrompt(injections: ContextInjection[]): string;
/**
 * Get a summary of humanizing features for this persona
 */
export declare function getHumanizingSummary(personaId: string): {
    unresolvedThreads: string[];
    commitments: Array<{
        what: string;
        who: 'user' | 'agent';
        fulfilled: boolean;
    }>;
    emotionalTrajectory: string;
    suggestedPacing: string;
};
export default buildConversationHumanizingContext;
//# sourceMappingURL=conversation-humanizing.d.ts.map