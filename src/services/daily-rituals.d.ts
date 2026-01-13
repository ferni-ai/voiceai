/**
 * Daily Rituals Service
 *
 * Manages daily engagement touchpoints that give users reasons to return.
 * Each persona has their own ritual style that deepens relationships over time.
 *
 * RITUALS:
 *   Ferni: Morning Sky Check - "What's your weather inside today?"
 *   Alex: Inbox Pulse - Quick daily check on communication clarity
 *   Maya: Habit Heartbeat - Daily streak check with Compound & Interest
 *   Jordan: Today's Chapter - Frame the day in life arc context
 *   Nayan: Morning Stillness - 15-second wisdom drop
 *   Peter: Pattern Pulse - One insight about recent patterns
 */
export interface DailyRitual {
    id: string;
    personaId: string;
    name: string;
    description: string;
    duration: string;
    frequency: 'daily' | 'weekday' | 'weekend' | 'weekly';
    preferredTime?: string;
    streakable: boolean;
}
export interface RitualCompletion {
    ritualId: string;
    userId: string;
    completedAt: Date;
    userResponse?: string;
    emotionalWeather?: EmotionalWeather;
    insights?: string[];
}
export interface EmotionalWeather {
    primary: 'sunny' | 'partly-cloudy' | 'cloudy' | 'rainy' | 'stormy' | 'foggy' | 'rainbow';
    energy: 'high' | 'medium' | 'low';
    note?: string;
}
export interface RitualStreak {
    ritualId: string;
    userId: string;
    currentStreak: number;
    longestStreak: number;
    lastCompletedAt: Date;
    totalCompletions: number;
    streakHistory: Array<{
        startDate: Date;
        endDate: Date;
        length: number;
    }>;
}
export interface UserRitualProfile {
    userId: string;
    activeRituals: string[];
    streaks: Record<string, RitualStreak>;
    emotionalWeatherHistory: Array<{
        date: Date;
        weather: EmotionalWeather;
    }>;
    weeklyInsights: string[];
    lastRitualDate: Date;
    totalRitualDays: number;
    preferences: {
        preferredTime: 'morning' | 'afternoon' | 'evening';
        reminderEnabled: boolean;
        favoriteRitual?: string;
    };
}
export declare const PERSONA_RITUALS: Record<string, DailyRitual>;
export declare const RITUAL_PROMPTS: {
    'ferni-sky-check': {
        openings: string[];
        weatherResponses: {
            sunny: string[];
            'partly-cloudy': string[];
            cloudy: string[];
            rainy: string[];
            stormy: string[];
            foggy: string[];
            rainbow: string[];
        };
        streakCelebrations: {
            3: string;
            7: string;
            14: string;
            30: string;
            66: string;
            100: string;
        };
    };
    'alex-inbox-pulse': {
        openings: string[];
        followUps: {
            clear: string[];
            manageable: string[];
            chaotic: string[];
        };
        streakCelebrations: {
            5: string;
            10: string;
            21: string;
        };
    };
    'maya-habit-heartbeat': {
        openings: string[];
        catCommentary: {
            compound: string[];
            interest: string[];
        };
        streakCelebrations: {
            3: string;
            7: string;
            21: string;
            30: string;
            66: string;
        };
    };
    'jordan-todays-chapter': {
        openings: string[];
        framingPrompts: string[];
        streakCelebrations: {
            7: string;
            30: string;
        };
    };
    'nayan-morning-stillness': {
        wisdomDrops: string[];
        streakCelebrations: {
            7: string;
            30: string;
            100: string;
        };
    };
    'peter-pattern-pulse': {
        openings: string[];
        patternTypes: string[];
        streakCelebrations: {
            7: string;
            14: string;
            30: string;
        };
    };
};
export declare class DailyRitualsService {
    private userProfiles;
    private firestoreEnabled;
    /**
     * Initialize Firestore integration
     */
    initializeFirestore(): Promise<void>;
    /**
     * Get or create a user's ritual profile
     */
    getOrCreateProfileAsync(userId: string): Promise<UserRitualProfile>;
    /**
     * Get or create a user's ritual profile (sync for backward compatibility)
     */
    getOrCreateProfile(userId: string): UserRitualProfile;
    /**
     * Activate a ritual for a user
     */
    activateRitual(userId: string, ritualId: string): Promise<void>;
    /**
     * Record a ritual completion
     */
    recordCompletionAsync(userId: string, ritualId: string, data?: {
        userResponse?: string;
        emotionalWeather?: EmotionalWeather;
        insights?: string[];
    }): Promise<{
        newStreak: number;
        isNewRecord: boolean;
        celebration?: string;
    }>;
    /**
     * Record a ritual completion (sync for backward compatibility)
     */
    recordCompletion(userId: string, ritualId: string, data?: {
        userResponse?: string;
        emotionalWeather?: EmotionalWeather;
        insights?: string[];
    }): {
        newStreak: number;
        isNewRecord: boolean;
        celebration?: string;
    };
    /**
     * Get streak celebration message if applicable
     */
    private getStreakCelebration;
    /**
     * Get ritual opening for a persona
     */
    getRitualOpening(ritualId: string): string;
    /**
     * Get weather-specific response for Ferni's sky check
     */
    getWeatherResponse(weather: EmotionalWeather['primary']): string;
    /**
     * Get Nayan's daily wisdom
     */
    getDailyWisdom(): string;
    /**
     * Get Maya's cat commentary
     */
    getCatCommentary(): {
        compound: string;
        interest: string;
    };
    /**
     * Get emotional weather trends for a user
     */
    getWeatherTrends(userId: string, days?: number): {
        dominantWeather: EmotionalWeather['primary'] | null;
        energyTrend: 'increasing' | 'stable' | 'decreasing';
        pattern?: string;
    };
    /**
     * Check if user should be reminded about a ritual
     */
    shouldRemind(userId: string, ritualId: string): boolean;
    /**
     * Get all due rituals for a user
     */
    getDueRituals(userId: string): DailyRitual[];
    /**
     * Export profile for persistence
     */
    exportProfile(userId: string): UserRitualProfile | null;
    /**
     * Import profile from persistence
     */
    importProfile(profile: UserRitualProfile): void;
}
export declare function getDailyRitualsService(): DailyRitualsService;
export declare function resetDailyRitualsService(): void;
export default DailyRitualsService;
//# sourceMappingURL=daily-rituals.d.ts.map