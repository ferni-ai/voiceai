/**
 * World Awareness Context Builder
 *
 * "Better Than Human" - Ferni already knows what's happening in the world.
 * This builder injects world context NATURALLY into conversations.
 *
 * Key principle: No "let me check" moments.
 * The WorldAwarenessService pre-fetches everything, this builder just decides
 * WHEN and HOW to inject that knowledge.
 *
 * Injection Strategy:
 * - Turn 0-1: Holiday greetings, weather hooks, exciting games
 * - Turn 2-5: Can reference news naturally if relevant
 * - Any turn: Sports updates if user has shown interest
 * - Occasional: Historical "on this day" facts
 *
 * @module WorldAwarenessBuilder
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
declare function buildWorldAwarenessContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
/**
 * Get a natural world-aware greeting enhancement.
 * Call this when building a greeting to add world context.
 *
 * @returns A phrase to weave into the greeting, or null
 */
export declare function getWorldAwareGreetingHook(userId: string): string | null;
/**
 * Get current weather summary for a user's location.
 * Returns null if no location set or weather unavailable.
 */
export declare function getCurrentWeatherSummary(userId: string): string | null;
/**
 * Get any exciting sports updates for user's tracked teams.
 */
export declare function getSportsUpdate(userId: string): string | null;
/**
 * Get today's holiday if any.
 */
export declare function getTodayHoliday(userId: string): {
    name: string;
    acknowledgment: string;
} | null;
export { buildWorldAwarenessContext };
//# sourceMappingURL=world-awareness.d.ts.map