/**
 * Proactive Conversation Starters
 *
 * Generates intelligent, contextual opening lines for conversations.
 * Particularly useful for returning users.
 *
 * Features:
 * - Time-aware greetings (morning vs evening)
 * - Memory-infused openers (reference past conversations)
 * - Thread continuity (pick up where left off)
 * - Seasonal awareness
 * - Calendar context (upcoming events)
 */
import type { PersonaConfig } from '../personas/types.js';
import type { UserProfile } from '../types/user-profile.js';
export interface ConversationOpener {
    greeting: string;
    followUp?: string;
    reason: string;
    type: OpenerType;
    ssmlTagged: boolean;
}
export type OpenerType = 'first_meeting' | 'returning_recent' | 'returning_familiar' | 'returning_reconnect' | 'time_aware' | 'memory_callback' | 'thread_continuity' | 'seasonal' | 'calendar_aware' | 'intention_followup';
export interface OpenerContext {
    isReturningUser: boolean;
    userName?: string;
    lastConversationDate?: Date;
    lastConversationSummary?: string;
    openQuestions?: string[];
    goals?: Array<{
        name: string;
        type: string;
    }>;
    primaryConcerns?: string[];
    upcomingEvents?: string[];
    currentMood?: string;
    /** BETTER-THAN-HUMAN: Pending intentions to follow up on */
    pendingIntentions?: Array<{
        intention: string;
        statedAt: Date;
        targetTime?: Date;
    }>;
}
/**
 * Generate a proactive conversation opener
 * Now LLM-powered with template fallback!
 */
export declare function generateProactiveOpener(persona: PersonaConfig, context: OpenerContext): ConversationOpener;
/**
 * Generate a proactive opener asynchronously with LLM
 */
export declare function generateProactiveOpenerAsync(persona: PersonaConfig, context: OpenerContext): Promise<ConversationOpener>;
/**
 * Build opener context from user profile
 */
export declare function buildOpenerContext(profile: UserProfile | null, isReturningUser: boolean): OpenerContext;
declare const _default: {
    generateProactiveOpener: typeof generateProactiveOpener;
    buildOpenerContext: typeof buildOpenerContext;
};
export default _default;
//# sourceMappingURL=proactive-starters.d.ts.map