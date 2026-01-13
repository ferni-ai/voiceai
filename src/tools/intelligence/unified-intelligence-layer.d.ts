/**
 * Unified Intelligence Layer
 *
 * Bridges the SemanticRouter and UnifiedToolOrchestrator to create
 * a "Better Than Human" tool selection system.
 *
 * HUMAN LIMITATIONS WE TRANSCEND:
 * 1. Perfect Memory - We remember every preference across sessions (Firestore)
 * 2. Anticipation - We predict needs before users express them
 * 3. Pattern Recognition - We see patterns humans miss
 * 4. Continuous Learning - Every interaction makes us smarter
 * 5. Proactive Suggestions - We surface tools users haven't discovered
 * 6. Emotion-Aware - We sense stress/anxiety and surface wellness tools
 * 7. Cross-Persona - We carry context when switching between team members
 * 8. Proactive Outreach - We remind users at their optimal times
 *
 * ARCHITECTURE:
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                  UNIFIED INTELLIGENCE LAYER                     │
 * ├─────────────────────────────────────────────────────────────────┤
 * │                                                                 │
 * │  ┌──────────────────┐        ┌──────────────────────┐          │
 * │  │ SemanticRouter   │◄──────►│ UnifiedOrchestrator   │          │
 * │  │ (per-transcript) │        │ (session tools)       │          │
 * │  └────────┬─────────┘        └─────────┬────────────┘          │
 * │           │                            │                        │
 * │           ▼                            ▼                        │
 * │  ┌──────────────────────────────────────────────────┐          │
 * │  │           SHARED INTELLIGENCE                     │          │
 * │  │  • PersonalizationEngine (user patterns)          │          │
 * │  │  • ToolChainPredictor (anticipation)              │          │
 * │  │  • ActiveLearningEngine (corrections)             │          │
 * │  │  • EmotionAwareSelection (voice prosody)          │          │
 * │  │  • CrossPersonaIntelligence (handoff context)     │          │
 * │  │  • ProactiveOutreachIntegration (time patterns)   │          │
 * │  └──────────────────────────────────────────────────┘          │
 * │                                                                 │
 * └─────────────────────────────────────────────────────────────────┘
 * ```
 *
 * @module tools/intelligence/unified-intelligence-layer
 */
/** Voice emotion state for emotion-aware tool selection */
export interface VoiceEmotionState {
    primary: string;
    valence: number;
    arousal: number;
    stressLevel: number;
    anxietyMarkers: boolean;
}
/** Cross-persona context for handoff intelligence */
export interface CrossPersonaContext {
    previousPersonaId: string;
    toolsUsedWithPreviousPersona: string[];
    effectiveToolChains: string[][];
    userPreferencesLearned: Record<string, unknown>;
    topicsDiscussed: string[];
    emotionalJourney: string[];
}
/** User intelligence profile for cross-system sharing */
export interface UserIntelligenceProfile {
    userId: string;
    timePatterns: {
        preferredToolsByHour: Map<number, string[]>;
        activeHours: number[];
        peakEngagementTimes: {
            hour: number;
            dayOfWeek: number;
        }[];
    };
    vocabulary: Map<string, string>;
    toolAffinities: Map<string, number>;
    recentChains: Array<{
        sequence: string[];
        timestamp: Date;
        context?: string;
    }>;
    corrections: Array<{
        expected: string;
        actual: string;
        query: string;
        timestamp: Date;
    }>;
    suggestedTools: Array<{
        toolId: string;
        reason: string;
        confidence: number;
        suggested: boolean;
    }>;
    crossPersonaContext?: CrossPersonaContext;
    lastEmotionalState?: VoiceEmotionState;
    outreachPatterns: {
        habitCheckTime?: number;
        engagementPeaks: number[];
        lastOutreach?: Date;
        outreachResponsiveness: number;
    };
}
/** Tool selection enhancement from intelligence layer */
export interface IntelligenceEnhancement {
    prioritizeTools: string[];
    anticipatedTools: string[];
    proactiveSuggestions: Array<{
        toolId: string;
        reason: string;
        triggerPhrase?: string;
    }>;
    contextHints: {
        likelyIntent?: string;
        emotionalContext?: string;
        timeContext?: 'morning' | 'afternoon' | 'evening' | 'night';
        isReturningUser: boolean;
        preferredDomains: string[];
    };
    confidenceAdjustments: Map<string, number>;
    emotionAwareBoosts?: {
        boostedDomains: string[];
        reason: string;
        detectedEmotion?: string;
        stressLevel?: number;
    };
    crossPersonaContext?: {
        previousPersonaId: string;
        toolsToCarryForward: string[];
        topicsToRemember: string[];
        emotionalContinuity: string;
    };
    proactiveOutreach?: {
        shouldTrigger: boolean;
        type: 'habit_reminder' | 'check_in' | 'pattern_based';
        suggestedMessage?: string;
        optimalTime?: Date;
    };
}
/** Learning event from semantic router */
export interface LearningEvent {
    userId: string;
    sessionId: string;
    query: string;
    predictedTool: string;
    actualTool: string;
    confidence: number;
    wasCorrection: boolean;
    timestamp: Date;
    context?: {
        timeOfDay: string;
        personaId: string;
        emotionalState?: string;
        voiceEmotion?: VoiceEmotionState;
    };
}
/** Handoff event for cross-persona intelligence */
export interface PersonaHandoffEvent {
    userId: string;
    sessionId: string;
    fromPersonaId: string;
    toPersonaId: string;
    toolsUsed: string[];
    topicsDiscussed: string[];
    emotionalState?: VoiceEmotionState;
    timestamp: Date;
}
/** Anticipation result from tool chain prediction */
export interface AnticipationResult {
    currentTool: string;
    predictedNext: Array<{
        toolId: string;
        probability: number;
        reason: 'co-occurrence' | 'user-pattern' | 'chain-pattern';
    }>;
    fullChain?: {
        steps: string[];
        confidence: number;
        estimatedDurationMs: number;
    };
}
export interface UnifiedIntelligenceConfig {
    /** Minimum interactions before personalization kicks in */
    minInteractionsForPersonalization: number;
    /** How many anticipated tools to pre-load */
    maxAnticipatedTools: number;
    /** Threshold for proactive suggestions */
    proactiveSuggestionThreshold: number;
    /** How long to remember user patterns (days) */
    patternRetentionDays: number;
    /** Enable anticipatory pre-loading */
    enableAnticipation: boolean;
    /** Enable proactive suggestions */
    enableProactiveSuggestions: boolean;
    /** Enable cross-session learning */
    enableCrossSessionLearning: boolean;
    /** Enable emotion-aware tool boosting */
    enableEmotionAwareness: boolean;
    /** Enable cross-persona intelligence */
    enableCrossPersonaIntelligence: boolean;
    /** Enable Firestore persistence */
    enableFirestorePersistence: boolean;
    /** Enable proactive outreach integration */
    enableProactiveOutreach: boolean;
    /** Stress threshold to boost wellness tools (0-1) */
    stressThresholdForWellnessBoost: number;
}
export declare class UnifiedIntelligenceLayer {
    private config;
    private userProfiles;
    private initialized;
    private dirtyProfiles;
    private saveDebounceTimer;
    private personalizationEngine;
    private chainPredictor;
    private activeLearning;
    private firestorePersistence;
    constructor(config?: Partial<UnifiedIntelligenceConfig>);
    initialize(): Promise<void>;
    /**
     * Enhance tool selection for the orchestrator
     *
     * Called when orchestrator is selecting tools for a session.
     * Returns intelligence-driven enhancements.
     */
    enhanceToolSelection(userId: string, currentContext: {
        personaId: string;
        timeOfDay?: Date;
        transcript?: string;
        sessionHistory?: string[];
        voiceEmotion?: VoiceEmotionState;
        previousPersonaId?: string;
    }): Promise<IntelligenceEnhancement>;
    /**
     * Apply emotion-aware tool boosts based on voice prosody
     *
     * A human friend might not notice you're stressed from your voice.
     * Ferni does, and proactively surfaces wellness tools.
     */
    private applyEmotionAwareBoosts;
    /**
     * Build context to carry forward from previous persona
     *
     * When you switch from Ferni to Maya, Maya should know what
     * tools worked well with Ferni, what topics you discussed,
     * and your emotional journey.
     */
    private buildCrossPersonaContext;
    /**
     * Record a persona handoff for cross-persona intelligence
     */
    recordHandoff(event: PersonaHandoffEvent): Promise<void>;
    /**
     * Evaluate if we should trigger proactive outreach
     *
     * "I notice you usually check your habits around this time..."
     */
    private evaluateProactiveOutreach;
    /**
     * Record outreach response for learning
     */
    recordOutreachResponse(userId: string, responded: boolean): void;
    /**
     * Trigger proactive outreach if conditions are met
     *
     * This connects the intelligence layer's outreach suggestions to the actual
     * outreach system. Called during session or on API check.
     */
    triggerProactiveOutreach(userId: string, outreach: NonNullable<IntelligenceEnhancement['proactiveOutreach']>): Promise<{
        triggered: boolean;
        messageId?: string;
        reason?: string;
    }>;
    /**
     * Anticipate which tools user will need next
     *
     * This is the "thinks three steps ahead" capability.
     */
    anticipateToolChain(userId: string, currentInput: string, sessionHistory?: string[]): Promise<AnticipationResult | null>;
    /**
     * Record a learning event (correction or confirmation)
     *
     * This closes the learning loop - corrections improve future predictions.
     */
    recordLearning(event: LearningEvent): Promise<void>;
    /**
     * Generate proactive tool suggestions for a user
     *
     * These are tools the user might benefit from but hasn't discovered yet.
     */
    private generateProactiveSuggestions;
    private getOrLoadProfile;
    /**
     * Mark a profile as needing persistence
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
     * Force save all dirty profiles (call on shutdown)
     */
    flushProfiles(): Promise<void>;
    /**
     * Serialize profile for Firestore storage
     */
    private serializeProfile;
    /**
     * Deserialize profile from Firestore
     */
    private deserializeProfile;
    /**
     * Get tool IDs for a list of domain names
     */
    private getToolsForDomains;
    private getTimeContext;
    private guessCurrentTool;
    private getUserToolPatterns;
    private learnVocabulary;
    private extractDomainFromToolId;
    getMetrics(): {
        profileCount: number;
        totalCorrections: number;
        avgToolAffinities: number;
    };
}
export declare function getUnifiedIntelligence(): UnifiedIntelligenceLayer;
export declare function initializeUnifiedIntelligence(): Promise<void>;
//# sourceMappingURL=unified-intelligence-layer.d.ts.map