/**
 * Seasonal Planning Intelligence
 *
 * "Humans don't track optimal timing across cultures and seasons."
 *
 * This service provides cultural and seasonal intelligence for event planning:
 * - Cultural dates to embrace or avoid
 * - Seasonal patterns (wedding season, graduation season, etc.)
 * - User's personal seasonal patterns (low energy months, peak months)
 * - Optimal timing recommendations
 *
 * Better Than Human: We know every cultural date, seasonal pattern, and your
 * personal rhythms to suggest perfect timing.
 *
 * @module services/superhuman/seasonal-planning-intelligence
 */
export interface CulturalDate {
    /** Date in MM-DD format (recurring) or YYYY-MM-DD (specific) */
    date: string;
    /** Name of the occasion */
    name: string;
    /** Cultures/religions this applies to */
    cultures: string[];
    /** How to treat this date for planning */
    planningAdvice: 'avoid' | 'embrace' | 'be_aware' | 'premium_pricing';
    /** Notes for planners */
    notes: string;
    /** Whether date moves year to year (lunar calendars, etc.) */
    moveable: boolean;
}
export interface SeasonalPattern {
    /** Pattern name */
    name: string;
    /** Months this applies to (1-12) */
    months: number[];
    /** Event types this affects */
    affectedEventTypes: string[];
    /** Impact on planning */
    impact: 'premium_pricing' | 'high_demand' | 'low_availability' | 'weather_risk' | 'optimal';
    /** Notes */
    notes: string;
}
export interface PersonalSeasonalPattern {
    /** Months where user typically has low energy */
    lowEnergyMonths: number[];
    /** Months where user is typically energized */
    highEnergyMonths: number[];
    /** Months with difficult anniversaries or memories */
    difficultMonths: number[];
    /** Months that are typically busy */
    busyMonths: number[];
    /** Preferred celebration months */
    preferredCelebrationMonths: number[];
}
export interface TimingRecommendation {
    /** Recommended date range */
    dateRange: {
        start: string;
        end: string;
    };
    /** Score (0-100) */
    score: number;
    /** Reasons for this score */
    reasons: string[];
    /** Warnings */
    warnings: string[];
    /** Cultural considerations */
    culturalNotes: string[];
}
export interface SeasonalPlanningProfile {
    userId: string;
    /** User's cultural backgrounds for relevant date tracking */
    culturalBackgrounds: string[];
    /** User's personal patterns */
    personalPatterns: PersonalSeasonalPattern;
    /** Historical event data for pattern learning */
    eventHistory: Array<{
        eventType: string;
        month: number;
        year: number;
        satisfactionScore: number;
        notes?: string;
    }>;
    lastUpdated: string;
}
declare function loadSeasonalProfile(userId: string): Promise<SeasonalPlanningProfile | null>;
/**
 * Get cultural dates relevant to a user
 */
export declare function getRelevantCulturalDates(userId: string, startDate: string, endDate: string): Promise<CulturalDate[]>;
/**
 * Get seasonal patterns affecting a date range
 */
export declare function getSeasonalPatterns(startDate: string, endDate: string, eventType?: string): SeasonalPattern[];
/**
 * Update user's cultural backgrounds
 */
export declare function updateCulturalBackgrounds(userId: string, cultures: string[]): Promise<void>;
/**
 * Update user's personal seasonal patterns
 */
export declare function updatePersonalPatterns(userId: string, patterns: Partial<PersonalSeasonalPattern>): Promise<void>;
/**
 * Record event outcome for pattern learning
 */
export declare function recordEventOutcome(userId: string, eventType: string, date: string, satisfactionScore: number, notes?: string): Promise<void>;
/**
 * Get optimal timing for an event
 */
export declare function suggestOptimalTiming(userId: string, eventType: string, preferredMonths?: number[], avoidMonths?: number[]): Promise<TimingRecommendation[]>;
/**
 * Check specific date for conflicts
 */
export declare function checkDateConflicts(userId: string, date: string): Promise<{
    culturalConflicts: CulturalDate[];
    seasonalConsiderations: SeasonalPattern[];
    personalConflicts: string[];
    recommendation: 'clear' | 'caution' | 'avoid';
}>;
/**
 * Build context string for LLM injection
 */
export declare function buildSeasonalPlanningContext(userId: string, eventType?: string, targetDate?: string): Promise<string>;
export declare const seasonalPlanningIntelligence: {
    getRelevantCulturalDates: typeof getRelevantCulturalDates;
    getSeasonalPatterns: typeof getSeasonalPatterns;
    updateCulturalBackgrounds: typeof updateCulturalBackgrounds;
    updatePersonalPatterns: typeof updatePersonalPatterns;
    recordEventOutcome: typeof recordEventOutcome;
    suggestOptimalTiming: typeof suggestOptimalTiming;
    checkDateConflicts: typeof checkDateConflicts;
    buildSeasonalPlanningContext: typeof buildSeasonalPlanningContext;
    loadSeasonalProfile: typeof loadSeasonalProfile;
};
export default seasonalPlanningIntelligence;
//# sourceMappingURL=seasonal-planning-intelligence.d.ts.map