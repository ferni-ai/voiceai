/**
 * Seasonal Memory Service
 *
 * Time-anchored memories that enable moments like:
 * - "Last winter you mentioned struggling with the dark days"
 * - "Around this time last year, you were dealing with [X]"
 * - "I've noticed you tend to feel [X] around this time of year"
 *
 * Philosophy: These are MEMORIES, not data points. Frame as
 * a friend who remembers, not a system that tracks.
 *
 * @module services/personal-journey/seasonal-memory
 */
import type { AnnualPattern, JourneyMoment, Season, SeasonalMemory, SeasonalSnapshot, TimeAnchoredMemory } from './types.js';
/**
 * Get current season
 */
export declare function getCurrentSeason(): Season;
/**
 * Get season from date
 */
export declare function getSeasonFromDate(date: Date): Season;
/**
 * Get previous season
 */
export declare function getPreviousSeason(season: Season): Season;
/**
 * Get or create seasonal memory for user
 */
export declare function getSeasonalMemory(userId: string): SeasonalMemory;
/**
 * Initialize from persisted data
 */
export declare function initializeSeasonalMemory(userId: string, persistedData?: Partial<SeasonalMemory>): void;
/**
 * Capture a seasonal snapshot (typically at end of season)
 */
export declare function captureSeasonalSnapshot(userId: string, data: {
    emotionalState: string;
    activeThemes: string[];
    keyMoments: string[];
    struggles?: string[];
    wins?: string[];
}): SeasonalSnapshot;
/**
 * Add a time-anchored memory
 */
export declare function addTimeAnchoredMemory(userId: string, data: {
    description: string;
    emotionalWeight: number;
    topics: string[];
    canReference?: boolean;
}): TimeAnchoredMemory;
/**
 * Detect annual patterns from snapshots
 */
export declare function detectAnnualPatterns(userId: string): AnnualPattern[];
/**
 * Get relevant memories for this time of year
 */
export declare function getRelevantTimeMemories(userId: string): JourneyMoment[];
/**
 * Mark a time-anchored memory as referenced
 */
export declare function markMemoryReferenced(userId: string, memoryId: string): void;
/**
 * Get seasonal context for greetings
 */
export declare function getSeasonalGreetingContext(userId: string): {
    hasSeasonalInsight: boolean;
    insight?: string;
    insightType?: 'last_year' | 'pattern' | 'transition';
};
/**
 * Get data for persistence
 */
export declare function getSeasonalMemoryForPersistence(userId: string): SeasonalMemory | null;
/**
 * Clear cache
 */
export declare function clearSeasonalCache(userId: string): void;
/**
 * Check if we should capture a seasonal snapshot
 * (Called periodically, captures at end of seasons)
 */
export declare function shouldCaptureSnapshot(userId: string): boolean;
//# sourceMappingURL=seasonal-memory.d.ts.map