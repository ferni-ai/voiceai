/**
 * Agent Evolution Engine
 *
 * Enables personas to self-improve based on:
 * 1. Community insights (what works across users)
 * 2. Individual feedback signals
 * 3. A/B testing results
 * 4. Emergent behavior detection
 *
 * This creates a closed loop where personas get smarter over time,
 * adapting their prompts, stories, and approaches based on data.
 *
 * SAFETY: All changes are logged and can be rolled back.
 */
/**
 * A learned adjustment to a persona's behavior
 */
export interface PersonaAdjustment {
    id: string;
    personaId: string;
    trigger: {
        condition: string;
        description: string;
    };
    adjustment: {
        type: 'prompt_addition' | 'strategy_preference' | 'story_ranking' | 'phrase_boost';
        content: string;
        priority: number;
    };
    source: 'community_pattern' | 'a_b_test' | 'user_feedback' | 'emergent_detection';
    confidence: number;
    effectivenessLift: number;
    createdAt: Date;
    lastApplied: Date;
    applicationCount: number;
    enabled: boolean;
}
/**
 * A/B test for persona behavior
 */
export interface PersonaExperiment {
    id: string;
    personaId: string;
    name: string;
    hypothesis: string;
    control: {
        description: string;
        promptModification?: string;
        strategyPreference?: string;
    };
    treatment: {
        description: string;
        promptModification?: string;
        strategyPreference?: string;
    };
    trafficAllocation: number;
    metrics: {
        engagement: {
            control: number;
            treatment: number;
            controlN: number;
            treatmentN: number;
        };
        satisfaction: {
            control: number;
            treatment: number;
            controlN: number;
            treatmentN: number;
        };
        depth: {
            control: number;
            treatment: number;
            controlN: number;
            treatmentN: number;
        };
    };
    status: 'draft' | 'running' | 'analyzing' | 'concluded';
    startedAt?: Date;
    endedAt?: Date;
    minimumSampleSize: number;
    winner?: 'control' | 'treatment' | 'inconclusive';
    winnerConfidence?: number;
}
/**
 * Detected emergent pattern in persona behavior
 */
export interface EmergentPattern {
    id: string;
    personaId: string;
    observedBehavior: string;
    frequency: number;
    context: string;
    correlatedOutcome: string;
    effectSize: number;
    confidence: number;
    recommendation: 'codify' | 'amplify' | 'investigate' | 'suppress';
    reasoning: string;
    status: 'detected' | 'under_review' | 'implemented' | 'rejected';
    implementedAt?: Date;
    reviewedBy?: string;
}
/**
 * Story ranking based on effectiveness data
 */
export interface StoryRanking {
    storyId: string;
    personaId: string;
    overallScore: number;
    byContext: Record<string, number>;
    sampleSize: number;
    lastUpdated: Date;
}
/**
 * Complete persona evolution state
 */
export interface PersonaEvolutionState {
    personaId: string;
    adjustments: PersonaAdjustment[];
    storyRankings: StoryRanking[];
    effectivePhrases: Array<{
        phrase: string;
        context: string;
        resonanceScore: number;
        sampleSize: number;
    }>;
    experiments: PersonaExperiment[];
    emergentPatterns: EmergentPattern[];
    evolutionMetrics: {
        avgEngagementBefore: number;
        avgEngagementAfter: number;
        improvementPercent: number;
        adjustmentsApplied: number;
        experimentsRun: number;
        lastEvolutionCycle: Date;
    };
}
export declare class AgentEvolutionEngine {
    private evolutionStates;
    private experiments;
    constructor();
    /**
     * Create a new adjustment from community insights
     */
    createAdjustmentFromCommunityPattern(personaId: string, pattern: {
        context: {
            userEmotion?: string;
            topic?: string;
            relationshipStage?: string;
        };
        bestStrategy: string;
        improvement: number;
        confidence: number;
    }): PersonaAdjustment;
    /**
     * Get active adjustments for a context
     */
    getActiveAdjustments(personaId: string, context: {
        userEmotion: string;
        topic: string;
        relationshipStage: string;
    }): PersonaAdjustment[];
    /**
     * Format adjustments for prompt injection
     */
    formatAdjustmentsForPrompt(adjustments: PersonaAdjustment[]): string;
    /**
     * Update story rankings from community data
     */
    updateStoryRankings(personaId: string): void;
    /**
     * Get recommended stories for a context
     */
    getRecommendedStories(personaId: string, context: {
        topic: string;
        relationshipStage: string;
        userEmotion: string;
    }, limit?: number): Array<{
        storyId: string;
        score: number;
        reason: string;
    }>;
    /**
     * Create a new experiment
     */
    createExperiment(experiment: Omit<PersonaExperiment, 'id' | 'metrics' | 'status'>): PersonaExperiment;
    /**
     * Get variant for a user in an experiment
     */
    getExperimentVariant(experimentId: string, userId: string): 'control' | 'treatment' | null;
    /**
     * Record experiment metric
     */
    recordExperimentMetric(experimentId: string, variant: 'control' | 'treatment', metric: 'engagement' | 'satisfaction' | 'depth', value: number): void;
    /**
     * Check if experiment can be concluded
     */
    private checkExperimentConclusion;
    /**
     * Create adjustment from winning experiment
     */
    private createAdjustmentFromExperiment;
    /**
     * Detect emergent patterns from conversation logs
     * This should be run periodically on conversation data
     */
    detectEmergentPatterns(personaId: string, conversations: Array<{
        turns: Array<{
            role: 'user' | 'assistant';
            content: string;
        }>;
        engagementScore: number;
        userSatisfaction: 'positive' | 'neutral' | 'negative';
    }>): EmergentPattern[];
    /**
     * Run a full evolution cycle for a persona
     * This should be run periodically (e.g., daily)
     */
    runEvolutionCycle(personaId: string): Promise<void>;
    private getOrCreateState;
    private buildConditionFromContext;
    private describeContext;
    private evaluateCondition;
    private hashString;
    private extractPhrases;
    /**
     * Record tool usage for analytics.
     * Used by analytics-worker to track which tools are being used effectively.
     */
    recordToolUsage(personaId: string, toolName: string, success: boolean): void;
    /**
     * Record a pattern for evolution tracking.
     * Used by analytics-worker for collective learning.
     */
    recordPattern(personaId: string, pattern: {
        type: string;
        context: string;
        success: boolean;
    }): void;
    exportState(): Map<string, PersonaEvolutionState>;
    importState(states: Map<string, PersonaEvolutionState> | Record<string, PersonaEvolutionState>): void;
}
/**
 * Load agent evolution state from Firestore
 * Called on startup to hydrate all persona states
 */
export declare function loadAgentEvolutionFromFirestore(): Promise<void>;
/**
 * Save agent evolution state to Firestore
 * Called periodically and on shutdown
 */
export declare function saveAgentEvolutionToFirestore(): Promise<void>;
/**
 * Initialize agent evolution with Firestore persistence
 * Should be called during startup
 */
export declare function initializeAgentEvolution(): Promise<AgentEvolutionEngine>;
export declare function getAgentEvolution(): AgentEvolutionEngine;
export declare function resetAgentEvolution(): void;
export default AgentEvolutionEngine;
//# sourceMappingURL=agent-evolution.d.ts.map