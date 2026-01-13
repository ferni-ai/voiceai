/**
 * Wellbeing Tracking System
 *
 * Phase 20: Continuous wellbeing assessment through conversation.
 * Tracks mood, energy, anxiety, connection, purpose, and sleep.
 *
 * Data is persisted to Firestore for cross-session retention with
 * in-memory caching for fast reads.
 *
 * @module WellbeingTracking
 */
export interface WellbeingDimensions {
    mood: number;
    moodStability: number;
    energy: number;
    motivation: number;
    worry: number;
    physicalTension: number;
    loneliness: number;
    socialSatisfaction: number;
    meaningfulness: number;
    hopefulness: number;
    sleepQuality: number;
    selfCareLevel: number;
}
export interface WellbeingSnapshot {
    id: string;
    userId: string;
    timestamp: Date;
    source: 'detected' | 'self_reported' | 'voice_analysis' | 'inferred';
    dimensions: Partial<WellbeingDimensions>;
    confidence: Partial<Record<keyof WellbeingDimensions, number>>;
    conversationId?: string;
    topic?: string;
    notes?: string;
}
export interface WellbeingBaseline {
    userId: string;
    dimensions: WellbeingDimensions;
    sampleCount: number;
    lastUpdated: Date;
}
export interface WellbeingTrend {
    dimension: keyof WellbeingDimensions;
    direction: 'improving' | 'stable' | 'declining';
    magnitude: number;
    confidence: number;
    periodDays: number;
}
export interface WellbeingProfile {
    userId: string;
    current: WellbeingSnapshot | null;
    personalBaseline: WellbeingBaseline | null;
    weeklyTrends: WellbeingTrend[];
    monthlyTrends: WellbeingTrend[];
    totalSnapshots: number;
    firstSnapshot: Date | null;
    lastSnapshot: Date | null;
}
export interface WellbeingAssessment {
    dimension: keyof WellbeingDimensions;
    naturalQuestion: string;
    followUpQuestions: string[];
    extractionPatterns: RegExp[];
    valueMapping: (match: string) => number;
}
export interface DetectedWellbeing {
    dimensions: Partial<WellbeingDimensions>;
    confidence: Partial<Record<keyof WellbeingDimensions, number>>;
    signals: Array<{
        dimension: keyof WellbeingDimensions;
        signal: string;
        value: number;
    }>;
}
/**
 * Record a wellbeing snapshot.
 * Persists to both in-memory cache and Firestore.
 */
export declare function recordSnapshot(userId: string, dimensions: Partial<WellbeingDimensions>, options?: {
    source?: WellbeingSnapshot['source'];
    confidence?: Partial<Record<keyof WellbeingDimensions, number>>;
    conversationId?: string;
    topic?: string;
    notes?: string;
}): WellbeingSnapshot;
/**
 * Detect wellbeing signals from a message.
 */
export declare function detectWellbeing(message: string): DetectedWellbeing;
/**
 * Get user's wellbeing profile.
 * Loads from Firestore if not in memory cache.
 */
export declare function getWellbeingProfileAsync(userId: string): Promise<WellbeingProfile>;
/**
 * Get user's wellbeing profile (sync version for backward compatibility).
 * Note: For new code, prefer getWellbeingProfileAsync.
 */
export declare function getWellbeingProfile(userId: string): WellbeingProfile;
/**
 * Get current wellbeing status.
 */
export declare function getCurrentWellbeing(userId: string): Partial<WellbeingDimensions> | null;
/**
 * Get a natural assessment question.
 */
export declare function getAssessmentQuestion(dimension: keyof WellbeingDimensions): WellbeingAssessment | null;
/**
 * Get all assessment questions.
 */
export declare function getAssessmentQuestions(): WellbeingAssessment[];
/**
 * Calculate trends for a dimension.
 */
export declare function calculateTrend(userId: string, dimension: keyof WellbeingDimensions, periodDays?: number): WellbeingTrend | null;
/**
 * Get a wellbeing summary for LLM context.
 */
export declare function getWellbeingContextInjection(userId: string): string;
/**
 * Get overall wellbeing score (0-100).
 */
export declare function getOverallScore(userId: string): number | null;
export interface WellbeingAlert {
    dimension: keyof WellbeingDimensions;
    severity: 'info' | 'notice' | 'urgent';
    message: string;
}
export interface WellbeingProcessResult {
    signals: DetectedWellbeing['signals'];
    alerts: WellbeingAlert[];
    llmContext: string | null;
    summary: {
        trend: 'improving' | 'stable' | 'declining' | 'unknown';
        currentState: Partial<WellbeingDimensions>;
    } | null;
}
/**
 * Process a message for wellbeing signals.
 * This is the main integration point for the context builder.
 */
export declare function processForWellbeing(userId: string, message: string, context?: {
    topic?: string;
    emotion?: string;
    emotionIntensity?: number;
    turnCount?: number;
}): WellbeingProcessResult;
/**
 * Get recent snapshots for a user
 */
export declare function getRecentSnapshots(userId: string, days?: number): WellbeingSnapshot[];
/**
 * Get all wellbeing profiles (for batch processing)
 */
export declare function getAllWellbeingProfiles(): WellbeingProfile[];
/**
 * Get users who need a check-in nudge
 */
export declare function getUsersNeedingCheckIn(options: {
    minDaysSinceCheckIn: number;
    maxDaysSinceCheckIn: number;
}): string[];
/**
 * Get last check-in time for a user
 */
export declare function getLastCheckInTime(userId: string): Date | null;
export declare const wellbeingTracker: {
    record: typeof recordSnapshot;
    detect: typeof detectWellbeing;
    getProfile: typeof getWellbeingProfile;
    getProfileAsync: typeof getWellbeingProfileAsync;
    getCurrent: typeof getCurrentWellbeing;
    getQuestion: typeof getAssessmentQuestion;
    getQuestions: typeof getAssessmentQuestions;
    getTrend: typeof calculateTrend;
    getScore: typeof getOverallScore;
    getContextInjection: typeof getWellbeingContextInjection;
    getRecentSnapshots: typeof getRecentSnapshots;
    getAllProfiles: typeof getAllWellbeingProfiles;
    getUsersNeedingCheckIn: typeof getUsersNeedingCheckIn;
    getLastCheckInTime: typeof getLastCheckInTime;
};
export default wellbeingTracker;
//# sourceMappingURL=index.d.ts.map