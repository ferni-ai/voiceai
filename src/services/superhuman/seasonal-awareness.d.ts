/**
 * Seasonal Awareness - Better Than Human Service
 *
 * What no human friend can do: Connect your patterns to larger cycles.
 *
 * Tracks how seasons, holidays, and cyclical events affect the user,
 * providing support that anticipates seasonal struggles and celebrations.
 *
 * @module services/superhuman/seasonal-awareness
 */
export type Season = 'spring' | 'summer' | 'fall' | 'winter';
export type SeasonalPattern = 'sad' | 'holiday_stress' | 'anniversary' | 'seasonal_energy' | 'year_end_reflection' | 'new_year_optimism' | 'birthday';
export interface SeasonalObservation {
    id: string;
    userId: string;
    month: number;
    dayOfMonth?: number;
    season: Season;
    type: SeasonalPattern;
    observation: string;
    sentiment: 'positive' | 'negative' | 'mixed' | 'neutral';
    observationCount: number;
    firstObserved: number;
    lastObserved: number;
}
export interface PersonalDate {
    id: string;
    userId: string;
    month: number;
    day: number;
    name: string;
    type: 'celebration' | 'anniversary' | 'memorial' | 'personal';
    sentiment: 'positive' | 'negative' | 'bittersweet' | 'neutral';
    importance: number;
    notes: string[];
    lastMentioned?: number;
}
export interface SeasonalContext {
    currentSeason: Season;
    currentMonth: number;
    daysUntilSeasonChange: number;
    activePatterns: SeasonalObservation[];
    upcomingDates: Array<{
        date: PersonalDate;
        daysUntil: number;
    }>;
    seasonalGuidance: string;
}
export declare function getCurrentSeason(date?: Date): Season;
export declare function getDaysUntilSeasonChange(date?: Date): number;
export declare function detectSeasonalPattern(transcript: string): {
    type: SeasonalPattern;
    observation: string;
} | null;
export declare function loadSeasonalObservations(userId: string): Promise<SeasonalObservation[]>;
export declare function loadPersonalDates(userId: string): Promise<PersonalDate[]>;
export declare function recordSeasonalObservation(userId: string, detected: {
    type: SeasonalPattern;
    observation: string;
}): Promise<SeasonalObservation>;
export declare function recordPersonalDate(userId: string, date: Omit<PersonalDate, 'id' | 'userId'>): Promise<PersonalDate>;
export declare function findUpcomingDates(userId: string, daysAhead?: number): Promise<Array<{
    date: PersonalDate;
    daysUntil: number;
}>>;
export declare function buildSeasonalContext(userId: string): Promise<string>;
export declare const seasonalAwareness: {
    getCurrentSeason: typeof getCurrentSeason;
    getDaysUntilSeasonChange: typeof getDaysUntilSeasonChange;
    detectPattern: typeof detectSeasonalPattern;
    loadObservations: typeof loadSeasonalObservations;
    loadDates: typeof loadPersonalDates;
    recordObservation: typeof recordSeasonalObservation;
    recordDate: typeof recordPersonalDate;
    findUpcoming: typeof findUpcomingDates;
    buildContext: typeof buildSeasonalContext;
};
//# sourceMappingURL=seasonal-awareness.d.ts.map