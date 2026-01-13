/**
 * Community Insights Engine
 *
 * Aggregates anonymized learning signals across ALL users to discover:
 * - What response strategies work best in different contexts
 * - Common user journeys and progression patterns
 * - Questions that lead to breakthroughs
 * - Stories and phrases that resonate
 *
 * This creates COLLECTIVE INTELLIGENCE that makes every persona smarter
 * based on learnings from the entire community.
 *
 * PRIVACY: All data is anonymized before aggregation. No PII stored.
 */
/**
 * Response strategy effectiveness in a specific context
 */
export interface ResponseStrategySignal {
    context: {
        userEmotion: string;
        topic: string;
        relationshipStage: string;
        personaId: string;
        timeOfDay: string;
        turnInConversation: number;
    };
    strategy: {
        type: 'story' | 'advice' | 'question' | 'empathy' | 'humor' | 'explanation';
        hadPersonalShare: boolean;
        hadQuirk: boolean;
        hadTeamReference: boolean;
        responseLength: 'brief' | 'moderate' | 'lengthy';
    };
    outcome: {
        engagementScore: number;
        userContinued: boolean;
        emotionalShift: 'positive' | 'neutral' | 'negative';
        topicDepthened: boolean;
        askFollowUp: boolean;
    };
    recordedAt: Date;
}
/**
 * Aggregated community pattern for response effectiveness
 */
export interface CommunityResponsePattern {
    id: string;
    context: {
        userEmotion?: string;
        topic?: string;
        relationshipStage?: string;
        personaId?: string;
    };
    strategies: Array<{
        type: string;
        avgEngagement: number;
        avgDepthening: number;
        avgPositiveShift: number;
        sampleSize: number;
        confidenceScore: number;
    }>;
    bestStrategy: string;
    improvementOverBaseline: number;
    lastUpdated: Date;
    totalSamples: number;
    minimumSamplesRequired: number;
}
/**
 * User journey stage transition
 */
export interface JourneyTransition {
    fromStage: string;
    toStage: string;
    avgDaysToTransition: number;
    commonTriggers: string[];
    blockers: string[];
    effectiveInterventions: string[];
    transitionRate: number;
    sampleSize: number;
}
/**
 * Community journey pattern
 */
export interface CommunityJourneyPattern {
    id: string;
    journeyType: string;
    startingState: string;
    endGoal: string;
    stages: Array<{
        stage: string;
        order: number;
        avgTimeInStage: number;
        keyMilestones: string[];
    }>;
    transitions: JourneyTransition[];
    successRate: number;
    avgTimeToCompletion: number;
    sampleSize: number;
    lastUpdated: Date;
}
/**
 * Question that leads to breakthroughs
 */
export interface EffectiveQuestion {
    questionPattern: string;
    topic: string;
    personaId: string;
    avgBreakthroughRate: number;
    avgEngagementLift: number;
    bestContexts: string[];
    sampleSize: number;
    lastUpdated: Date;
}
/**
 * Story resonance across the community
 */
export interface StoryResonance {
    storyId: string;
    personaId: string;
    overallEffectiveness: number;
    byRelationshipStage: Record<string, number>;
    byTopic: Record<string, number>;
    byUserEmotion: Record<string, number>;
    userReactions: {
        moved: number;
        inspired: number;
        connected: number;
        curious: number;
        indifferent: number;
    };
    bestContexts: string[];
    sampleSize: number;
    lastUpdated: Date;
}
/**
 * Phrase effectiveness
 */
export interface PhraseEffectiveness {
    phrase: string;
    personaId: string;
    context: string;
    resonanceScore: number;
    engagementLift: number;
    memorability: number;
    sampleSize: number;
    lastUpdated: Date;
}
export declare class CommunityInsightsEngine {
    private responseSignals;
    private patterns;
    private journeyPatterns;
    private effectiveQuestions;
    private storyResonance;
    private phraseEffectiveness;
    private readonly MIN_SAMPLES;
    private readonly HIGH_CONFIDENCE_SAMPLES;
    constructor();
    /**
     * Record a response strategy signal from a conversation
     * This is called after each agent response to capture what worked
     */
    recordResponseSignal(signal: ResponseStrategySignal): void;
    /**
     * Record a story being told and user reaction
     */
    recordStoryUsage(storyId: string, personaId: string, context: {
        topic: string;
        relationshipStage: string;
        userEmotion: string;
    }, reaction: 'moved' | 'inspired' | 'connected' | 'curious' | 'indifferent', engagementScore: number): void;
    /**
     * Record a simple engagement signal from response quality tracking
     * This is a simplified interface for the session manager
     */
    recordEngagementSignal(params: {
        personaId: string;
        responseType: string;
        topic: string;
        engagementScore: number;
        timestamp: Date;
    }): void;
    private getTimeOfDay;
    /**
     * Record a question that led to a breakthrough moment
     */
    recordBreakthroughQuestion(questionPattern: string, personaId: string, topic: string, context: string, engagementLift: number): void;
    /**
     * Recompute all community patterns from signals
     * This should be run periodically (e.g., daily batch job)
     */
    recomputePatterns(): void;
    private groupSignalsByContext;
    private computePatternFromSignals;
    /**
     * Get the best response strategy for a given context
     */
    getBestStrategy(context: {
        userEmotion: string;
        topic: string;
        relationshipStage: string;
        personaId: string;
    }): {
        strategy: string;
        confidence: number;
        expectedEngagement: number;
        alternatives: string[];
    } | null;
    /**
     * Get stories that resonate in a given context
     */
    getResonantStories(personaId: string, context: {
        topic: string;
        relationshipStage: string;
        userEmotion: string;
    }, limit?: number): Array<{
        storyId: string;
        expectedEffectiveness: number;
        reason: string;
    }>;
    /**
     * Get effective questions for a topic
     */
    getEffectiveQuestions(personaId: string, topic: string, limit?: number): Array<{
        question: string;
        expectedBreakthroughRate: number;
        bestContext: string;
    }>;
    /**
     * Get community journey pattern for a starting state
     */
    getJourneyPattern(startingState: string): CommunityJourneyPattern | null;
    private anonymizeSignal;
    private updateSegmentEffectiveness;
    private findBestMatchingPattern;
    /**
     * Export insights for storage
     */
    exportInsights(): {
        patterns: CommunityResponsePattern[];
        journeyPatterns: CommunityJourneyPattern[];
        effectiveQuestions: EffectiveQuestion[];
        storyResonance: StoryResonance[];
    };
    /**
     * Import insights from storage
     */
    importInsights(data: {
        patterns?: CommunityResponsePattern[];
        journeyPatterns?: CommunityJourneyPattern[];
        effectiveQuestions?: EffectiveQuestion[];
        storyResonance?: StoryResonance[];
    }): void;
    /**
     * Record an emotional pattern for collective learning.
     * Used by analytics-worker to aggregate anonymous emotional patterns.
     */
    recordEmotionalPattern(emotion: string, intensity: number, topic: string | undefined, personaId: string | undefined): void;
    /**
     * Record an insight from conversation analysis.
     * Used by analytics-worker for collective learning.
     */
    recordInsight(insight: {
        type: string;
        topic?: string;
        emotion?: string;
        personaId?: string;
    }): void;
    getStats(): {
        totalSignals: number;
        totalPatterns: number;
        totalEffectiveQuestions: number;
        totalStoryResonance: number;
        avgPatternConfidence: number;
    };
}
/**
 * Load community insights from Firestore
 * Called on startup to hydrate the singleton
 */
export declare function loadCommunityInsightsFromFirestore(): Promise<void>;
/**
 * Save community insights to Firestore
 * Called periodically and on shutdown
 */
export declare function saveCommunityInsightsToFirestore(): Promise<void>;
/**
 * Initialize community insights with Firestore persistence
 * Should be called during startup
 */
export declare function initializeCommunityInsights(): Promise<CommunityInsightsEngine>;
export declare function getCommunityInsights(): CommunityInsightsEngine;
export declare function resetCommunityInsights(): void;
export default CommunityInsightsEngine;
//# sourceMappingURL=community-insights.d.ts.map