/**
 * Advanced Cognitive Intelligence System
 *
 * Extends the base cognitive system with:
 * - User cognitive style detection
 * - Cognitive handoff transfer
 * - Multi-step reasoning chains
 * - Cognitive conflict resolution
 * - Cognitive learning and growth
 * - Knowledge state persistence
 */
import type { CognitiveProfile, ReasoningStyle, AttentionFocus } from './cognitive-types.js';
/**
 * Get cognitive style cache statistics
 */
export declare function getCognitiveStyleCacheStats(): {
    size: number;
    hits: number;
    misses: number;
    evictions: number;
    hitRate: number;
};
/**
 * Clear cognitive style cache (for testing)
 */
export declare function clearCognitiveStyleCache(): void;
/**
 * User's cognitive style - how THEY think
 */
export type UserCognitiveStyle = 'analytical' | 'emotional' | 'practical' | 'narrative' | 'systematic' | 'intuitive' | 'unknown';
/**
 * Signals that indicate cognitive style
 */
interface CognitiveSignals {
    analyticalScore: number;
    emotionalScore: number;
    practicalScore: number;
    narrativeScore: number;
    systematicScore: number;
    intuitiveScore: number;
    totalSignals: number;
}
/**
 * Detect user's cognitive style from their messages
 */
export declare function detectUserCognitiveStyle(messages: string[]): {
    primary: UserCognitiveStyle;
    secondary?: UserCognitiveStyle;
    confidence: number;
    signals: CognitiveSignals;
};
/**
 * Cognitive context to transfer during handoffs
 */
export interface CognitiveHandoffContext {
    /** What the previous persona noticed */
    noticed: string[];
    /** What the previous persona might have missed (their blind spots) */
    potentialBlindSpots: AttentionFocus[];
    /** User's detected cognitive style */
    userCognitiveStyle: UserCognitiveStyle;
    /** Reasoning approaches that worked */
    effectiveApproaches: ReasoningStyle[];
    /** Topics where user showed expertise */
    userExpertiseTopics: string[];
    /** Topics that need more explanation */
    needsMoreExplanation: string[];
    /** Suggested approach for receiving persona */
    suggestedApproach?: string;
    /** Cognitive "handoff note" - natural language summary */
    handoffNote: string;
}
/**
 * Build cognitive handoff context from previous persona's session
 */
export declare function buildCognitiveHandoffContext(previousPersonaId: string, targetPersonaId: string, sessionData: {
    topics: string[];
    userMessages: string[];
    reasoningApproaches: ReasoningStyle[];
    userExpertiseTopics?: string[];
    needsExplanation?: string[];
}): CognitiveHandoffContext;
export interface ReasoningStep {
    step: number;
    approach: ReasoningStyle;
    purpose: string;
    duration: 'brief' | 'moderate' | 'extended';
    showReasoning: boolean;
}
export interface ReasoningChain {
    id: string;
    steps: ReasoningStep[];
    totalSteps: number;
    currentStep: number;
    context: string;
}
/**
 * Build a multi-step reasoning chain for complex situations
 */
export declare function buildReasoningChain(personaProfile: CognitiveProfile, context: {
    topic: string;
    emotionalWeight: number;
    complexity: 'simple' | 'moderate' | 'complex' | 'ambiguous';
    userNeed: 'information' | 'support' | 'decision' | 'exploration';
}): ReasoningChain | null;
/**
 * Get the current step's guidance from a reasoning chain
 */
export declare function getReasoningChainGuidance(chain: ReasoningChain): string;
export interface CognitiveConflict {
    detected: boolean;
    personaStyle: ReasoningStyle;
    userNeed: 'emotional_support' | 'practical_action' | 'deep_analysis' | 'exploration' | 'validation';
    severity: 'mild' | 'moderate' | 'significant';
    resolution: 'shift_to_secondary' | 'acknowledge_limitation' | 'offer_handoff' | 'blend_approaches';
    phrase: string;
}
/**
 * Detect and resolve cognitive style conflicts
 */
export declare function detectCognitiveConflict(personaProfile: CognitiveProfile, context: {
    userEmotion: string;
    emotionalIntensity: number;
    userCognitiveStyle: UserCognitiveStyle;
    currentTopic: string;
    requestType: 'question' | 'venting' | 'seeking_advice' | 'sharing' | 'celebrating';
}): CognitiveConflict | null;
export interface CognitiveEffectiveness {
    approach: ReasoningStyle;
    context: string;
    userResponse: 'engaged' | 'neutral' | 'disengaged' | 'breakthrough';
    userCognitiveStyle: UserCognitiveStyle;
    timestamp: Date;
}
export interface CognitiveLearning {
    userId: string;
    personaId: string;
    /** Which approaches work best with this user */
    effectiveApproaches: Map<ReasoningStyle, number>;
    /** User's preferred cognitive style */
    userPreferredStyle: UserCognitiveStyle;
    /** Approaches that led to breakthroughs */
    breakthroughApproaches: ReasoningStyle[];
    /** Approaches to avoid */
    ineffectiveApproaches: ReasoningStyle[];
    /** Topics where user has expertise (skip basics) */
    expertiseTopics: string[];
    /** Topics that need more explanation */
    noviceTopics: string[];
    /** Total interactions for confidence */
    totalInteractions: number;
}
/**
 * Track cognitive approach effectiveness
 *
 * NOW WITH PERSISTENCE! Cognitive learnings are saved to Firestore so we
 * actually learn HOW to communicate with each user over time.
 */
export declare class CognitiveLearningTracker {
    private learnings;
    private recentEffectiveness;
    private loadedUsers;
    private pendingSaves;
    private saveTimeout;
    /**
     * Load learning from persistence if not already loaded
     */
    ensureLoaded(userId: string, personaId: string): Promise<void>;
    /**
     * Schedule a debounced save to persistence
     */
    private scheduleSave;
    /**
     * Flush all pending saves to Firestore
     */
    flushPendingSaves(): Promise<void>;
    /**
     * Record a cognitive approach and user response
     */
    recordApproachEffectiveness(userId: string, personaId: string, approach: ReasoningStyle, context: string, userResponse: CognitiveEffectiveness['userResponse'], userCognitiveStyle: UserCognitiveStyle): void;
    /**
     * Record expertise level for a topic
     */
    recordTopicExpertise(userId: string, personaId: string, topic: string, level: 'expert' | 'novice'): void;
    /**
     * Get learning for a user-persona pair
     */
    getLearning(userId: string, personaId: string): CognitiveLearning | null;
    /**
     * Get learning with async persistence load
     */
    getLearningAsync(userId: string, personaId: string): Promise<CognitiveLearning | null>;
    /**
     * Get recommended approach based on learning
     */
    getRecommendedApproach(userId: string, personaId: string, defaultApproach: ReasoningStyle): {
        approach: ReasoningStyle;
        confidence: number;
        reason: string;
    };
    /**
     * Export learnings for persistence
     */
    exportLearnings(): Record<string, CognitiveLearning>;
    /**
     * Import learnings from persistence
     */
    importLearnings(data: Record<string, Omit<CognitiveLearning, 'effectiveApproaches'> & {
        effectiveApproaches: Record<string, number>;
    }>): void;
}
export declare function getCognitiveLearningTracker(): CognitiveLearningTracker;
/**
 * Initialize cognitive learning for a user-persona pair (call at session start)
 */
export declare function initializeCognitiveLearning(userId: string, personaId: string): Promise<void>;
/**
 * Flush cognitive learning to persistence (call at session end)
 */
export declare function flushCognitiveLearning(): Promise<void>;
export interface UserKnowledgeState {
    userId: string;
    /** Topics we've explained to this user */
    topicsExplained: Map<string, {
        firstExplained: Date;
        timesRevisited: number;
        understandingLevel: 'introduced' | 'learning' | 'comfortable' | 'expert';
        lastAssessedConfidence: number;
        personaWhoExplained: string;
    }>;
    /** Don't re-explain these */
    skipExplanationFor: string[];
    /** User has asked about these multiple times - might need different approach */
    confusionTopics: string[];
}
/**
 * Track what we've explained to users
 *
 * NOW WITH PERSISTENCE! Knowledge state is saved to Firestore so we don't
 * re-explain concepts users already understand.
 */
export declare class KnowledgeStateTracker {
    private states;
    private loadedUsers;
    private pendingSaves;
    private saveTimeout;
    /**
     * Load state from persistence if not already loaded
     */
    ensureLoaded(userId: string): Promise<void>;
    /**
     * Schedule a debounced save to persistence
     */
    private scheduleSave;
    /**
     * Flush all pending saves to Firestore
     */
    flushPendingSaves(): Promise<void>;
    /**
     * Record that we explained a topic
     */
    recordExplanation(userId: string, topic: string, personaId: string, userResponse: 'understood' | 'confused' | 'already_knew' | 'asked_more'): void;
    /**
     * Get explanation guidance for a topic
     */
    getExplanationGuidance(userId: string, topic: string): {
        shouldExplain: boolean;
        depth: 'skip' | 'brief_reminder' | 'moderate' | 'full';
        note: string;
    };
    /**
     * Get explanation guidance with async persistence load
     */
    getExplanationGuidanceAsync(userId: string, topic: string): Promise<{
        shouldExplain: boolean;
        depth: 'skip' | 'brief_reminder' | 'moderate' | 'full';
        note: string;
    }>;
    /**
     * Get state for persistence
     */
    getState(userId: string): UserKnowledgeState | null;
    /**
     * Load state from persistence
     */
    loadState(userId: string, data: Omit<UserKnowledgeState, 'topicsExplained'> & {
        topicsExplained: Record<string, UserKnowledgeState['topicsExplained'] extends Map<string, infer V> ? V : never>;
    }): void;
}
export declare function getKnowledgeStateTracker(): KnowledgeStateTracker;
/**
 * Initialize knowledge state for a user (call at session start)
 */
export declare function initializeKnowledgeState(userId: string): Promise<void>;
/**
 * Flush knowledge state to persistence (call at session end)
 */
export declare function flushKnowledgeState(): Promise<void>;
export interface CognitiveGrowthProfile {
    /** Relationship stage affects cognitive approach */
    relationshipStage: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
    /** How much to show reasoning (decreases with trust) */
    showReasoningLevel: number;
    /** How much to adapt to user (increases with familiarity) */
    adaptationLevel: number;
    /** Cognitive shortcuts allowed (increases with trust) */
    shortcutsAllowed: boolean;
    /** Can reference past cognitive patterns */
    canReferenceHistory: boolean;
}
/**
 * Get cognitive growth adjustments based on relationship stage
 */
export declare function getCognitiveGrowthProfile(relationshipStage: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor', sessionCount: number): CognitiveGrowthProfile;
/**
 * Build cognitive growth context for prompt
 */
export declare function buildCognitiveGrowthContext(profile: CognitiveGrowthProfile, cognitivelearning: CognitiveLearning | null): string;
declare const _default: {
    detectUserCognitiveStyle: typeof detectUserCognitiveStyle;
    buildCognitiveHandoffContext: typeof buildCognitiveHandoffContext;
    buildReasoningChain: typeof buildReasoningChain;
    getReasoningChainGuidance: typeof getReasoningChainGuidance;
    detectCognitiveConflict: typeof detectCognitiveConflict;
    getCognitiveLearningTracker: typeof getCognitiveLearningTracker;
    getKnowledgeStateTracker: typeof getKnowledgeStateTracker;
    getCognitiveGrowthProfile: typeof getCognitiveGrowthProfile;
    buildCognitiveGrowthContext: typeof buildCognitiveGrowthContext;
};
export default _default;
//# sourceMappingURL=cognitive-advanced.d.ts.map