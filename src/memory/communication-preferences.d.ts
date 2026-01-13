/**
 * Communication Preferences Tracker
 *
 * Learns HOW users prefer to be approached, not just WHAT they talk about.
 * Tracks response patterns to different communication styles.
 *
 * Philosophy: The best friends know that Sarah needs to vent before advice,
 * that Mike responds better to humor when stressed, and that Alex finds
 * surprise memory callbacks delightful while Jordan finds them intrusive.
 * This module learns these preferences organically.
 *
 * @module memory/communication-preferences
 */
import type { CommunicationPreferencesService, InteractionPreference, ApproachGuidance, PreferenceDimension } from './interfaces/index.js';
/**
 * Save user preferences to Firestore
 */
export declare function saveUserPreferences(userId: string, preferences: InteractionPreference[]): Promise<boolean>;
/**
 * Load user preferences from Firestore
 */
export declare function loadUserPreferences(userId: string): Promise<InteractionPreference[] | null>;
interface PreferencesConfig {
    /** Minimum observations before confident (default: 3) */
    minObservationsForConfidence: number;
    /** Decay factor for old observations (default: 0.95 per week) */
    observationDecay: number;
    /** Maximum evidence items to keep (default: 20) */
    maxEvidenceItems: number;
}
interface ResponseSignal {
    signal: 'positive' | 'negative' | 'neutral';
    confidence: number;
    indicators: string[];
}
/**
 * Analyze user response to detect positive/negative/neutral reaction
 */
declare function analyzeResponseSentiment(response: string): ResponseSignal;
export declare class CommunicationPreferences implements CommunicationPreferencesService {
    private config;
    private preferences;
    private loadingPromises;
    constructor(config?: Partial<PreferencesConfig>);
    /**
     * Ensure preferences are loaded from Firestore (with caching)
     */
    private ensureLoaded;
    /**
     * Observe an interaction and update preferences
     * Now persists to Firestore after each update
     */
    observeInteraction(observation: {
        userId: string;
        dimension: PreferenceDimension;
        ourApproach: string;
        userResponse: string;
        situation: string;
    }): Promise<void>;
    /**
     * Get all preferences for a user (loads from Firestore if needed)
     */
    getPreferences(userId: string): Promise<InteractionPreference[]>;
    /**
     * Get approach guidance based on preferences and current context
     */
    getApproachGuidance(userId: string, context: {
        emotion?: string;
        topic?: string;
    }): Promise<ApproachGuidance>;
    /**
     * Initialize default preferences for a new user
     */
    private initializePreferences;
    /**
     * Recalculate preference based on evidence
     */
    private recalculatePreference;
    /**
     * Determine overall approach based on preferences and context
     */
    private determineOverallApproach;
    export(): Array<[string, InteractionPreference[]]>;
    import(data: Array<[string, InteractionPreference[]]>): void;
    /**
     * Get stats
     */
    getStats(userId: string): {
        dimensionsTracked: number;
        totalObservations: number;
        avgConfidence: number;
        strongPreferences: string[];
    };
}
export declare function getCommunicationPreferences(): CommunicationPreferences;
export declare function resetCommunicationPreferences(): void;
declare const _default: {
    CommunicationPreferences: typeof CommunicationPreferences;
    getCommunicationPreferences: typeof getCommunicationPreferences;
    resetCommunicationPreferences: typeof resetCommunicationPreferences;
    analyzeResponseSentiment: typeof analyzeResponseSentiment;
};
export default _default;
//# sourceMappingURL=communication-preferences.d.ts.map