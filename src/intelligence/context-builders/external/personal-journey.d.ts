/**
 * Personal Journey Context Builder
 *
 * Injects journey awareness into conversation prompts.
 * Makes the LLM aware of milestones, seasonal memories,
 * chapter context, and growth mirrors.
 *
 * Philosophy: Inject as hints and awareness, not instructions.
 * Let the persona naturally incorporate the awareness.
 *
 * @module intelligence/context-builders/personal-journey
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
/**
 * Check if we should inject journey context based on turn
 */
declare function shouldInjectJourneyContext(turnCount: number, userText: string | undefined): {
    shouldInject: boolean;
    reason: string;
};
/**
 * Build background context about the journey (always included, lightweight)
 */
declare function buildBackgroundJourneyContext(userId: string): string | null;
/**
 * Build personal journey context for injection
 */
declare function buildPersonalJourneyContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
export { buildBackgroundJourneyContext, buildPersonalJourneyContext, shouldInjectJourneyContext };
/**
 * Get a journey-aware greeting enhancement
 * Can be called directly by greeting systems
 */
export declare function getJourneyGreetingEnhancement(userId: string): Promise<{
    hasEnhancement: boolean;
    content?: string;
    type?: string;
}>;
/**
 * Get journey stats for debugging/display
 */
export declare function getJourneyStatsForDisplay(userId: string): {
    totalConversations: number;
    daysKnown: number;
    currentStreak: number;
    relationshipStage: string;
    currentChapter?: string;
    inTransition: boolean;
};
//# sourceMappingURL=personal-journey.d.ts.map