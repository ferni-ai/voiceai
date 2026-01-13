/**
 * Seasonal Awareness
 *
 * Anticipates and responds to seasonal patterns in user's emotional
 * wellbeing, including holidays, weather changes, and personal anniversaries.
 *
 * Philosophy: A great friend knows that December is hard for you,
 * or that spring makes you feel alive. Seasons affect us deeply.
 *
 * Pattern Types:
 * - Calendar seasons (winter, spring, summer, fall)
 * - Holidays (cultural, religious, personal)
 * - Personal anniversaries (both positive and difficult)
 * - Weather patterns
 * - Day length (SAD awareness)
 *
 * @module SeasonalAwareness
 */
export type Season = 'spring' | 'summer' | 'fall' | 'winter';
export type HolidayType = 'cultural' | 'religious' | 'personal' | 'universal';
export type AnniversaryType = 'joyful' | 'difficult' | 'mixed' | 'milestone';
export interface SeasonalProfile {
    userId: string;
    seasonPatterns: SeasonPattern[];
    holidayPreferences: HolidayPreference[];
    personalDates: PersonalDate[];
    sadIndicators: SADIndicator[];
    insights: SeasonalInsight[];
    timezone: string;
    hemisphere: 'northern' | 'southern';
    lastUpdated: Date;
}
export interface SeasonPattern {
    season: Season;
    avgMood: number;
    energyLevel: 'low' | 'normal' | 'high';
    challenges: string[];
    strengths: string[];
    sampleCount: number;
}
export interface HolidayPreference {
    holiday: string;
    type: HolidayType;
    sentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
    notes?: string;
    avoidMentioning?: boolean;
}
export interface PersonalDate {
    id: string;
    date: {
        month: number;
        day: number;
    };
    name: string;
    type: AnniversaryType;
    description?: string;
    yearsAgo?: number;
    approach: 'celebrate' | 'acknowledge' | 'gentle' | 'avoid';
    daysBeforeToMention?: number;
}
export interface SADIndicator {
    date: Date;
    daylight: 'short' | 'normal' | 'long';
    moodScore: number;
    energyScore: number;
    correlation?: number;
}
export interface SeasonalInsight {
    type: 'pattern' | 'warning' | 'opportunity';
    insight: string;
    relevantSeason?: Season;
    confidence: number;
}
export interface SeasonalContext {
    currentSeason: Season;
    daysIntoSeason: number;
    upcomingHolidays: UpcomingHoliday[];
    upcomingPersonalDates: UpcomingPersonalDate[];
    seasonalWarnings: string[];
    proactiveSuggestions: string[];
}
export interface UpcomingHoliday {
    name: string;
    date: Date;
    daysUntil: number;
    userSentiment: 'positive' | 'neutral' | 'negative' | 'mixed' | 'unknown';
    suggestedApproach: string;
}
export interface UpcomingPersonalDate {
    name: string;
    date: Date;
    daysUntil: number;
    type: AnniversaryType;
    approach: string;
}
/**
 * Get current season
 */
export declare function getCurrentSeason(hemisphere?: 'northern' | 'southern', date?: Date): Season;
/**
 * Record seasonal mood data
 */
export declare function recordSeasonalData(userId: string, data: {
    mood: number;
    energy: 'low' | 'normal' | 'high';
    context?: string;
}): void;
/**
 * Add personal date
 */
export declare function addPersonalDate(userId: string, date: Omit<PersonalDate, 'id'>): PersonalDate;
/**
 * Update holiday preference
 */
export declare function updateHolidayPreference(userId: string, holiday: string, preference: Partial<HolidayPreference>): void;
/**
 * Detect potential SAD patterns
 */
export declare function detectSADPatterns(userId: string): {
    likely: boolean;
    correlation: number;
    recommendation?: string;
};
/**
 * Build seasonal context for user
 */
export declare function buildSeasonalContext(userId: string): SeasonalContext;
/**
 * Get seasonal profile
 */
export declare function getSeasonalProfile(userId: string): SeasonalProfile | null;
/**
 * Generate seasonal context for LLM
 */
export declare function generateSeasonalContextForLLM(userId: string): string | null;
declare const _default: {
    getCurrentSeason: typeof getCurrentSeason;
    recordSeasonalData: typeof recordSeasonalData;
    addPersonalDate: typeof addPersonalDate;
    updateHolidayPreference: typeof updateHolidayPreference;
    buildSeasonalContext: typeof buildSeasonalContext;
    detectSADPatterns: typeof detectSADPatterns;
    getSeasonalProfile: typeof getSeasonalProfile;
    generateSeasonalContextForLLM: typeof generateSeasonalContextForLLM;
};
export default _default;
//# sourceMappingURL=seasonal-awareness.d.ts.map