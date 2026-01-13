/**
 * User Personalization Layer
 *
 * Learns individual user preferences to improve routing accuracy.
 * A user who always says "play music" meaning Spotify should get
 * boosted Spotify confidence, while another who means Apple Music
 * should get Apple Music boosted.
 *
 * Features:
 * 1. Per-user tool boosts learned from history
 * 2. Vocabulary adaptation (user's word → tool mapping)
 * 3. Time-of-day preferences
 * 4. Context-dependent routing (work vs personal)
 *
 * @module tools/semantic-router/advanced/personalization
 */
interface ToolMatch {
    toolId: string;
    confidence: number;
    metadata?: Record<string, unknown>;
}
export interface UserProfile {
    userId: string;
    toolBoosts: Map<string, number>;
    vocabulary: Map<string, string>;
    timePatterns: Map<string, Map<string, number>>;
    contextPatterns: Map<string, Map<string, number>>;
    totalInteractions: number;
    lastUpdated: Date;
    correctionRate: number;
}
interface PersonalizationConfig {
    minInteractionsForBoost: number;
    maxBoost: number;
    decayFactor: number;
    learningRate: number;
}
interface InteractionEvent {
    userId: string;
    query: string;
    predictedTool: string;
    actualTool: string;
    timestamp: Date;
    context?: string;
}
export declare class PersonalizationEngine {
    private profiles;
    private dirtyProfiles;
    private saveDebounceTimer;
    private loadedProfiles;
    private initialized;
    private config;
    constructor(customConfig?: Partial<PersonalizationConfig>);
    /**
     * Initialize the engine (loads Firestore connection)
     */
    initialize(): Promise<void>;
    /**
     * Apply user personalization to tool matches
     * Will auto-load profile from Firestore if not in memory
     */
    personalize(userId: string, matches: ToolMatch[], context?: {
        query: string;
        time?: Date;
        contextTag?: string;
    }): ToolMatch[];
    /**
     * Learn from a user interaction
     */
    learn(event: InteractionEvent): void;
    /**
     * Load a user profile from Firestore
     */
    loadProfile(userId: string): Promise<UserProfile | null>;
    /**
     * Load profile in background (non-blocking)
     */
    private loadProfileInBackground;
    /**
     * Mark a profile as needing to be saved
     */
    private markProfileDirty;
    /**
     * Schedule a debounced save of dirty profiles
     */
    private scheduleDebouncedSave;
    /**
     * Save all dirty profiles to Firestore
     */
    private saveDirtyProfiles;
    /**
     * Force save all dirty profiles immediately (call on shutdown)
     */
    flushProfiles(): Promise<void>;
    /**
     * Get user's correction rate (for uncertainty adjustment)
     */
    getCorrectionRate(userId: string): number;
    /**
     * Export profile for debugging
     */
    exportProfile(userId: string): UserProfile | null;
    /**
     * Apply time decay to all profiles
     */
    applyDecay(): void;
    private getOrCreateProfile;
    private updateToolBoost;
    private checkVocabulary;
    private learnVocabulary;
    private getTimeBoost;
    private updateTimePattern;
    private getContextBoost;
    private updateContextPattern;
}
export declare function getPersonalizationEngine(): PersonalizationEngine;
/**
 * Initialize the personalization engine with Firestore persistence
 * Call this on startup to enable cross-session learning
 */
export declare function initializePersonalization(): Promise<void>;
/**
 * Flush profiles on shutdown
 */
export declare function flushPersonalizationProfiles(): Promise<void>;
export {};
//# sourceMappingURL=personalization.d.ts.map