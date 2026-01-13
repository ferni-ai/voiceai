/**
 * Cultural Awareness Service
 *
 * Handles holiday awareness, seasonal adjustments, and cultural moment
 * integration into persona responses.
 */
export interface Holiday {
    name: string;
    date: Date;
    type: 'major' | 'minor' | 'observance';
    region?: string;
    greetings?: string[];
}
export type Season = 'spring' | 'summer' | 'fall' | 'winter';
export interface CulturalContext {
    currentHoliday?: Holiday;
    upcomingHoliday?: Holiday;
    season: Season;
    monthContext: string;
}
declare function getSeason(): Season;
/**
 * Get current cultural context
 */
export declare function getCulturalContext(): CulturalContext;
/**
 * Get a holiday greeting if appropriate
 */
export declare function getHolidayGreeting(): string | null;
/**
 * Get upcoming holiday mention for conversation
 */
export declare function getUpcomingHolidayMention(): string | null;
/**
 * Get seasonal behavior adjustments
 */
export declare function getSeasonalAdjustment(): {
    energyModifier: number;
    topicSuggestions: string[];
};
/**
 * Get cultural moment from persona behaviors
 */
export declare function getCulturalMoment(personaId: string): Promise<string | null>;
/**
 * Check if financial/market-relevant date
 */
export declare function isFinanciallyRelevantDate(): {
    relevant: boolean;
    reason?: string;
};
export declare const CulturalAwarenessService: {
    getContext: typeof getCulturalContext;
    getHolidayGreeting: typeof getHolidayGreeting;
    getUpcomingHolidayMention: typeof getUpcomingHolidayMention;
    getSeasonalAdjustment: typeof getSeasonalAdjustment;
    getCulturalMoment: typeof getCulturalMoment;
    isFinanciallyRelevantDate: typeof isFinanciallyRelevantDate;
    getSeason: typeof getSeason;
};
export default CulturalAwarenessService;
//# sourceMappingURL=cultural-awareness.d.ts.map