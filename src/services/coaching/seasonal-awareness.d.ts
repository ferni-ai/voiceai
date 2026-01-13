/**
 * Seasonal & Contextual Awareness
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Awareness of time, seasons, holidays, and contextual factors
 * that affect people's emotional states and needs.
 *
 * Philosophy:
 * - Time affects mood
 * - Holidays aren't universal (nor universally happy)
 * - Context shapes everything
 *
 * @module SeasonalAwareness
 */
export type Season = 'spring' | 'summer' | 'fall' | 'winter';
export type HolidayType = 'major_secular' | 'religious' | 'cultural' | 'personal';
export interface Holiday {
    name: string;
    date: Date | null;
    type: HolidayType;
    cultural_context: string[];
    emotional_notes: string;
    checkInBefore?: string;
    checkInAfter?: string;
}
export interface SeasonalContext {
    season: Season;
    seasonalThemes: string[];
    dayLength: 'short' | 'medium' | 'long';
    holidayProximity: Holiday[];
    timeOfYear: string;
}
export interface UserSeasonalProfile {
    userId: string;
    timezone: string;
    culturalBackground?: string[];
    religiousBackground?: string[];
    knownDifficultTimes: Array<{
        period: string;
        reason?: string;
        lastMentioned: Date;
    }>;
    preferredHolidays: string[];
    avoidHolidays: string[];
}
/**
 * Get current season (Northern Hemisphere default)
 */
export declare function getCurrentSeason(date?: Date): Season;
/**
 * Get day length category
 */
export declare function getDayLength(date?: Date): 'short' | 'medium' | 'long';
/**
 * Get upcoming holidays (next 30 days)
 */
export declare function getUpcomingHolidays(userId: string, date?: Date): Holiday[];
/**
 * Get full seasonal context
 */
export declare function getSeasonalContext(userId: string): SeasonalContext;
/**
 * Record a difficult time of year for a user
 */
export declare function recordDifficultTime(userId: string, period: string, reason?: string): void;
/**
 * Check if current time is difficult for user
 */
export declare function isCurrentlyDifficultTime(userId: string): {
    isDifficult: boolean;
    period?: string;
    reason?: string;
};
/**
 * Build LLM context for seasonal awareness
 */
export declare function buildSeasonalContext(userId: string): string | null;
/**
 * Set user's holiday preferences
 */
export declare function setHolidayPreferences(userId: string, preferences: {
    celebrate?: string[];
    avoid?: string[];
    culturalBackground?: string[];
    religiousBackground?: string[];
}): void;
export declare function exportSeasonalProfile(userId: string): UserSeasonalProfile | null;
export declare function importSeasonalProfile(profile: UserSeasonalProfile): void;
declare const _default: {
    getCurrentSeason: typeof getCurrentSeason;
    getDayLength: typeof getDayLength;
    getUpcomingHolidays: typeof getUpcomingHolidays;
    getSeasonalContext: typeof getSeasonalContext;
    recordDifficultTime: typeof recordDifficultTime;
    isCurrentlyDifficultTime: typeof isCurrentlyDifficultTime;
    buildSeasonalContext: typeof buildSeasonalContext;
    setHolidayPreferences: typeof setHolidayPreferences;
    exportSeasonalProfile: typeof exportSeasonalProfile;
    importSeasonalProfile: typeof importSeasonalProfile;
};
export default _default;
//# sourceMappingURL=seasonal-awareness.d.ts.map