/**
 * Cameo Analytics Service
 *
 * Tracks cameo engagement and user preferences to enable:
 * 1. Analytics on which cameos resonate most
 * 2. Learning user preferences for cameo frequency
 * 3. Personalized cameo suggestions based on history
 *
 * Data is persisted to Firestore for cross-session learning.
 */
import type { CameoPersonaId, CameoTriggerType } from './types.js';
/**
 * Individual cameo engagement record
 */
export interface CameoEngagement {
    cameoId: string;
    personaId: CameoPersonaId;
    triggerType: CameoTriggerType;
    timestamp: number;
    userRespondedPositively: boolean;
    userAskedFollowUp: boolean;
    userRequestedHandoff: boolean;
    conversationContinued: boolean;
    durationMs: number;
    triggerKeywords?: string[];
    userEmotionalState?: string;
    conversationTopic?: string;
}
/**
 * Aggregated persona engagement stats
 */
export interface PersonaEngagementStats {
    personaId: CameoPersonaId;
    totalCameos: number;
    positiveResponses: number;
    followUpRequests: number;
    handoffRequests: number;
    averageDurationMs: number;
    engagementRate: number;
    lastCameoAt: number;
    triggerTypeStats: Record<CameoTriggerType, {
        count: number;
        positiveRate: number;
    }>;
}
/**
 * User's cameo preferences (learned over time)
 */
export interface CameoPreferences {
    userId: string;
    updatedAt: number;
    preferredFrequency: 'rare' | 'occasional' | 'frequent';
    maxCameosPerSession: number;
    minCooldownMs: number;
    favoritePersonas: CameoPersonaId[];
    avoidPersonas: CameoPersonaId[];
    respondWellTo: CameoTriggerType[];
    ignoredTriggers: CameoTriggerType[];
    totalCameosReceived: number;
    totalPositiveResponses: number;
    overallEngagementRate: number;
}
/**
 * Clear session data (call on session end)
 */
export declare function clearSessionData(sessionId: string): void;
/**
 * Record a cameo engagement event
 */
export declare function recordCameoEngagement(userId: string, sessionId: string, engagement: CameoEngagement): Promise<void>;
/**
 * Analyze user's response to determine engagement signals
 */
export declare function analyzeUserResponse(userMessage: string, cameoPersonaId: CameoPersonaId, timeSinceCameoMs: number): Partial<CameoEngagement>;
/**
 * Get user's learned cameo preferences
 */
export declare function getUserPreferences(userId: string): Promise<CameoPreferences>;
/**
 * Get engagement stats for a specific persona
 */
export declare function getPersonaStats(userId: string, personaId: CameoPersonaId): Promise<PersonaEngagementStats | null>;
/**
 * Get global engagement stats for a persona (across all users)
 * Used for admin analytics dashboard
 */
export declare function getGlobalPersonaStats(personaId: CameoPersonaId): Promise<PersonaEngagementStats | null>;
/**
 * Get best persona for a given trigger type (based on user history)
 */
export declare function getBestPersonaForTrigger(userId: string, triggerType: CameoTriggerType): Promise<CameoPersonaId | null>;
declare const _default: {
    recordCameoEngagement: typeof recordCameoEngagement;
    analyzeUserResponse: typeof analyzeUserResponse;
    getUserPreferences: typeof getUserPreferences;
    getPersonaStats: typeof getPersonaStats;
    getBestPersonaForTrigger: typeof getBestPersonaForTrigger;
    clearSessionData: typeof clearSessionData;
};
export default _default;
//# sourceMappingURL=cameo-analytics.d.ts.map