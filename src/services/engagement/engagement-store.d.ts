/**
 * Engagement Firestore Store
 *
 * Persists daily rituals, streaks, emotional weather, and engagement data to Firestore.
 * Provides the foundation for all engagement features requiring persistence.
 *
 * Collections:
 * - engagement_profiles/{userId} - Main engagement profile
 * - engagement_profiles/{userId}/ritual_streaks/{ritualId} - Individual ritual streaks
 * - engagement_profiles/{userId}/weather_history/{date} - Daily emotional weather
 * - engagement_profiles/{userId}/predictions/{predictionId} - Weekly predictions
 * - engagement_profiles/{userId}/team_huddles/{huddleId} - Team huddle history
 */
import type { EmotionalWeather, UserRitualProfile } from '../daily-rituals.js';
export interface EngagementProfile {
    userId: string;
    activeRituals: string[];
    totalRitualDays: number;
    longestOverallStreak: number;
    lastEngagementAt: string;
    preferences: {
        preferredTime: 'morning' | 'afternoon' | 'evening';
        reminderEnabled: boolean;
        favoritePersona?: string;
    };
    stats: {
        totalSkyChecks: number;
        totalPredictions: number;
        predictionAccuracy: number;
        teamHuddlesAttended: number;
        memoryCallbacksTriggered: number;
    };
    /** 🎮 Game memory - music games, insights, milestones */
    gameMemory?: import('../../types/user-profile.js').GameMemory;
    /** 🎵 Music preferences across sessions */
    musicMemory?: import('../../types/user-profile.js').MusicMemory;
    createdAt: string;
    updatedAt: string;
}
export interface StoredRitualStreak {
    ritualId: string;
    personaId: string;
    currentStreak: number;
    longestStreak: number;
    lastCompletedAt: string;
    totalCompletions: number;
    streakHistory: Array<{
        startDate: string;
        endDate: string;
        length: number;
    }>;
}
export interface StoredWeatherEntry {
    date: string;
    weather: EmotionalWeather;
    ritualId: string;
    insights?: string[];
}
export interface StoredPrediction {
    id: string;
    weekOf: string;
    predictions: Record<string, number>;
    actuals?: Record<string, number>;
    accuracy?: number;
    createdAt: string;
    completedAt?: string;
}
export interface StoredTeamHuddle {
    id: string;
    participatingPersonas: string[];
    topic: string;
    userHighlights: string[];
    celebratedMilestones: string[];
    occurredAt: string;
}
export declare class EngagementStore {
    private db;
    private readonly COLLECTION;
    private memoryCache;
    /**
     * Initialize Firestore connection
     */
    initialize(): Promise<void>;
    /**
     * Get or create engagement profile
     */
    getProfile(userId: string): Promise<EngagementProfile>;
    /**
     * Save engagement profile
     */
    saveProfile(profile: EngagementProfile): Promise<void>;
    /**
     * Get ritual streak
     */
    getRitualStreak(userId: string, ritualId: string): Promise<StoredRitualStreak | null>;
    /**
     * Save ritual streak
     */
    saveRitualStreak(userId: string, streak: StoredRitualStreak): Promise<void>;
    /**
     * Record emotional weather
     */
    recordWeather(userId: string, entry: StoredWeatherEntry): Promise<void>;
    /**
     * Get weather history
     */
    getWeatherHistory(userId: string, days?: number): Promise<StoredWeatherEntry[]>;
    /**
     * Save prediction
     */
    savePrediction(userId: string, prediction: StoredPrediction): Promise<void>;
    /**
     * Get recent predictions
     */
    getRecentPredictions(userId: string, limit?: number): Promise<StoredPrediction[]>;
    /**
     * Record team huddle
     */
    recordTeamHuddle(userId: string, huddle: StoredTeamHuddle): Promise<void>;
    /**
     * Get all ritual streaks for a user
     */
    getAllStreaks(userId: string): Promise<StoredRitualStreak[]>;
    /**
     * Update prediction with actuals
     */
    updatePredictionActuals(userId: string, predictionId: string, actuals: Record<string, number>): Promise<{
        accuracy: number;
    } | null>;
    /**
     * Create default profile
     */
    private createDefaultProfile;
    /**
     * Convert to UserRitualProfile format for backward compatibility
     */
    toRitualProfile(userId: string): Promise<UserRitualProfile>;
    addConversationSession(userId: string, session: Record<string, unknown>): Promise<void>;
    getConversationSessions(userId: string, limit?: number): Promise<Array<Record<string, unknown>>>;
    getConversationSession(userId: string, sessionId: string): Promise<Record<string, unknown> | null>;
    addInsightToLatestSession(userId: string, insight: string): Promise<void>;
    addHighlightToLatestSession(userId: string, highlight: string): Promise<void>;
    updateSessionMood(userId: string, sessionId: string, mood: string, energy?: string): Promise<void>;
    getPredictions(userId: string, limit?: number): Promise<StoredPrediction[]>;
    getRitualStreaks(userId: string): Promise<StoredRitualStreak[]>;
    /** Firestore batch write limit */
    private readonly FIRESTORE_BATCH_LIMIT;
    deleteUserData(userId: string): Promise<void>;
    /**
     * Get user IDs that have been active in the last N days
     */
    getActiveUserIds(daysActive?: number): Promise<string[]>;
}
export declare function getEngagementStore(): Promise<EngagementStore>;
export declare function resetEngagementStore(): void;
export default EngagementStore;
//# sourceMappingURL=engagement-store.d.ts.map