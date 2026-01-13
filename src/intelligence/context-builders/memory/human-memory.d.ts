/**
 * Human Memory Context Builder
 *
 * Surfaces human-centric memory to the LLM so Ferni can:
 * - Remember birthdays and anniversaries
 * - Know what comforts vs. stresses the user
 * - Respect topics they avoid
 * - Acknowledge their growth
 * - Reference inside jokes naturally
 *
 * This is what makes someone feel truly known.
 *
 * @module intelligence/context-builders/human-memory
 */
import type { HumanMemory, ImportantDate, GrowthMarker, InsideJoke } from '../../../types/human-memory.js';
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
/**
 * Check if a date is within N days from today
 */
declare function isWithinDays(date: ImportantDate, days: number): boolean;
/**
 * Get days until a date
 */
declare function getDaysUntil(date: ImportantDate): number;
/**
 * Check if today is the date
 */
declare function isToday(date: ImportantDate): boolean;
/**
 * Find important dates coming up soon
 */
declare function getUpcomingDates(humanMemory: Partial<HumanMemory>, lookAheadDays?: number): {
    today: ImportantDate[];
    upcoming: ImportantDate[];
};
/**
 * Build date awareness injection
 */
declare function buildDateContext(humanMemory: Partial<HumanMemory>): ContextInjection | null;
/**
 * Build context about what comforts/stresses the user
 */
declare function buildEmotionalSignatureContext(humanMemory: Partial<HumanMemory>, currentEmotion?: string): ContextInjection | null;
/**
 * Build context about topics to avoid
 */
declare function buildAvoidanceContext(humanMemory: Partial<HumanMemory>): ContextInjection | null;
/**
 * Find growth that hasn't been acknowledged yet
 */
declare function getUnacknowledgedGrowth(humanMemory: Partial<HumanMemory>): GrowthMarker[];
/**
 * Build context for celebrating growth
 */
declare function buildGrowthContext(humanMemory: Partial<HumanMemory>): ContextInjection | null;
/**
 * Get active inside jokes (not retired)
 */
declare function getActiveInsideJokes(humanMemory: Partial<HumanMemory>): InsideJoke[];
/**
 * Build context for inside jokes
 */
declare function buildInsideJokesContext(humanMemory: Partial<HumanMemory>): ContextInjection | null;
/**
 * Build context about their values and identity
 */
declare function buildIdentityContext(humanMemory: Partial<HumanMemory>): ContextInjection | null;
/**
 * Build context about ongoing themes in their life
 */
declare function buildRunningThemesContext(humanMemory: Partial<HumanMemory>): ContextInjection | null;
/**
 * Build context about challenges they're working through
 */
declare function buildChallengesContext(humanMemory: Partial<HumanMemory>): ContextInjection | null;
/**
 * Build context about seasonal/temporal patterns
 */
declare function buildTemporalContext(humanMemory: Partial<HumanMemory>): ContextInjection | null;
/**
 * Build human memory context for the current turn
 */
declare function buildHumanMemoryContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
export { buildHumanMemoryContext, buildDateContext, buildEmotionalSignatureContext, buildAvoidanceContext, buildGrowthContext, buildInsideJokesContext, buildIdentityContext, buildRunningThemesContext, buildChallengesContext, buildTemporalContext, getUpcomingDates, getUnacknowledgedGrowth, getActiveInsideJokes, isWithinDays, isToday, getDaysUntil, };
//# sourceMappingURL=human-memory.d.ts.map