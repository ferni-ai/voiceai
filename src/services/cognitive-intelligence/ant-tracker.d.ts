/**
 * Automatic Negative Thought (ANT) Tracker
 *
 * Phase 19: Track patterns of negative automatic thoughts over time.
 * Identifies temporal patterns, topic triggers, and progress trends.
 *
 * PERSISTENCE: Uses Firestore for cross-session ANT tracking with in-memory caching.
 *
 * @module ANTTracker
 */
import type { CognitiveDistortion, DistortionDetection } from './distortion-detector.js';
export interface ANTPattern {
    userId: string;
    distortionFrequency: Map<CognitiveDistortion, number>;
    topDistortions: CognitiveDistortion[];
    timeOfDayPatterns: Map<TimeOfDay, CognitiveDistortion[]>;
    dayOfWeekPatterns: Map<DayOfWeek, CognitiveDistortion[]>;
    topicTriggers: Map<string, CognitiveDistortion[]>;
    distortionTrend: 'increasing' | 'stable' | 'decreasing';
    reframingSuccess: number;
    firstRecorded: Date;
    lastUpdated: Date;
    totalRecordings: number;
}
export interface ANTEntry {
    id: string;
    userId: string;
    timestamp: Date;
    distortion: CognitiveDistortion;
    triggerPhrase: string;
    topic?: string;
    emotionalContext?: string;
    intensity: number;
    wasReframed: boolean;
    reframeAccepted?: boolean;
}
export interface ANTInsight {
    type: 'temporal' | 'topic' | 'progress' | 'pattern';
    title: string;
    description: string;
    confidence: number;
    actionable?: string;
}
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';
export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
export interface WeeklyReport {
    userId: string;
    weekStart: Date;
    weekEnd: Date;
    totalDistortions: number;
    uniqueDistortionTypes: number;
    mostCommonDistortion: CognitiveDistortion;
    peakDay: DayOfWeek;
    peakTime: TimeOfDay;
    comparedToLastWeek: 'better' | 'same' | 'worse';
    percentageChange: number;
    insights: ANTInsight[];
    celebration?: string;
    focus?: string;
}
/**
 * Load user data from Firestore (pattern + entries)
 */
export declare function loadUserANTData(userId: string): Promise<{
    pattern: ANTPattern | null;
    entries: ANTEntry[];
}>;
/**
 * Record a new ANT entry.
 */
export declare function recordANT(userId: string, detection: DistortionDetection, options?: {
    topic?: string;
    emotionalContext?: string;
    intensity?: number;
}): ANTEntry;
/**
 * Record whether a reframe was accepted.
 */
export declare function recordReframeResponse(userId: string, entryId: string, accepted: boolean): void;
/**
 * Get ANT patterns for a user.
 */
export declare function getANTPatterns(userId: string): ANTPattern;
/**
 * Get insights for a user.
 */
export declare function getInsights(userId: string): ANTInsight[];
/**
 * Generate a weekly report.
 */
export declare function generateWeeklyReport(userId: string): WeeklyReport;
/**
 * Get LLM context injection for ANT patterns.
 */
export declare function getANTContextInjection(userId: string): string;
/**
 * Clear old ANT data beyond retention period
 */
export declare function clearOldANTData(daysToKeep?: number): Promise<number>;
/**
 * Get all users with ANT data (for analytics/scheduled jobs)
 */
export declare function getAllUsersWithANTData(): Promise<string[]>;
/**
 * Delete user's ANT data (for GDPR compliance)
 */
export declare function deleteUserANTData(userId: string): Promise<void>;
/**
 * Clear in-memory cache (useful for testing)
 */
export declare function clearCache(): void;
export declare const antTracker: {
    record: typeof recordANT;
    recordReframe: typeof recordReframeResponse;
    getPatterns: typeof getANTPatterns;
    getInsights: typeof getInsights;
    getWeeklyReport: typeof generateWeeklyReport;
    getContextInjection: typeof getANTContextInjection;
    loadUserData: typeof loadUserANTData;
    clearOldData: typeof clearOldANTData;
    getAllUsers: typeof getAllUsersWithANTData;
    deleteUserData: typeof deleteUserANTData;
    clearCache: typeof clearCache;
};
export default antTracker;
//# sourceMappingURL=ant-tracker.d.ts.map