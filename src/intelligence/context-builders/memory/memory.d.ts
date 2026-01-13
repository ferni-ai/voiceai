import type { UserProfile } from '../../../types/user-profile.js';
import { type ContextBuilderInput, type ContextInjection, type SessionServices } from '../index.js';
interface ExtendedSessionServices extends SessionServices {
    getEnhancedPromptContext?: () => string;
    searchPastConversations?: (query: string) => Promise<string | null>;
    learningEngine?: {
        getProactiveInsight: (profile: UserProfile | null, turnCount: number) => string | null;
    };
}
interface FollowUpResult {
    question: string;
    context: string;
}
/**
 * Generate a memory callback phrase referencing earlier in conversation
 */
declare function getMemoryCallback(topics: string[], userName?: string): string | null;
/**
 * Generate cross-session memory reference
 *
 * NOTE: lastConversationSummary is intentionally EXCLUDED here because:
 * 1. It's already handled by the greeting (40% chance in greetings.ts)
 * 2. It's included in priming memories (advanced-memory.ts)
 * Including it here caused the LLM to see the same info 2-3 times,
 * making it repeatedly reference "what we talked about last time".
 *
 * Instead, we reference MORE SPECIFIC things: goals, concerns, key moments.
 * These feel more personal and avoid the repetition problem.
 */
declare function getCrossSessionMemory(services: ExtendedSessionServices, userName?: string): string | null;
/**
 * Get time since last conversation context
 */
declare function getTimeSinceContext(lastContact: Date): string | null;
/**
 * Get emotional continuity check
 */
declare function getEmotionalContinuity(profile: UserProfile): string | null;
/**
 * Generate intelligent follow-up question based on history
 */
declare function getIntelligentFollowUp(services: ExtendedSessionServices): FollowUpResult | null;
/**
 * Build memory-related context injections
 */
declare function buildMemoryContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
export { buildMemoryContext, getCrossSessionMemory, getEmotionalContinuity, getIntelligentFollowUp, getMemoryCallback, getTimeSinceContext, };
//# sourceMappingURL=memory.d.ts.map