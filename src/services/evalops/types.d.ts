/**
 * EvalOps Type Definitions
 *
 * > "Better than human" requires measurement.
 *
 * This module defines the types for Ferni's evaluation operations system.
 * EvalOps ensures that persona behaviors actually manifest in LLM outputs,
 * not just exist as beautiful architecture.
 *
 * Core Philosophy:
 * 1. You can't improve what you don't measure
 * 2. Persona voice consistency is measurable
 * 3. Trust building behaviors can be verified
 * 4. Emotional intelligence can be evaluated
 */
/**
 * A persona's unique "voice fingerprint" - what makes them sound like THEM
 */
export interface PersonaVoiceFingerprint {
    personaId: string;
    /** Phrases this persona uses often (e.g., "stay the course" for Ferni) */
    signaturePhrases: string[];
    /** Words/phrases this persona should AVOID (anti-patterns) */
    antiPatterns: string[];
    /** Expected vocabulary profile - word categories and frequencies */
    vocabularyProfile: {
        /** High-frequency words for this persona */
        frequentWords: string[];
        /** Words that indicate persona drift */
        driftIndicators: string[];
    };
    /** Typical sentence structure */
    sentenceProfile: {
        averageLength: 'short' | 'medium' | 'long';
        questionFrequency: 'low' | 'medium' | 'high';
        storyFrequency: 'low' | 'medium' | 'high';
    };
    /** Emotional tone profile */
    emotionalTone: {
        warmth: number;
        directness: number;
        analyticalVsEmotional: number;
        energy: number;
    };
    /** Reasoning style indicators */
    reasoningIndicators: {
        style: 'narrative' | 'analytical' | 'systematic' | 'empathetic' | 'intuitive' | 'pragmatic';
        evidenceUsage: 'stories' | 'data' | 'examples' | 'principles';
        uncertaintyHandling: 'explore' | 'converge' | 'synthesize';
    };
}
/**
 * Evaluation dimensions for a single response
 */
export interface ResponseEvaluationDimensions {
    /** Does this response sound like the persona? (0-100) */
    personaVoice: number;
    /** Did we read the emotional room correctly? (0-100) */
    emotionalIntelligence: number;
    /** Did we actually help the user? (0-100) */
    helpfulness: number;
    /** Does it feel like talking to a real person? (0-100) */
    authenticity: number;
    /** Is the response safe and appropriate? (0-100) */
    safety: number;
    /** Did we use memory/context appropriately? (0-100) */
    contextUse: number;
    /** Did we strengthen the relationship? (0-100) */
    trustBuilding: number;
}
/**
 * Full evaluation result for a single response
 */
export interface ResponseEvaluation {
    /** Unique evaluation ID */
    id: string;
    /** Timestamp of evaluation */
    timestamp: Date;
    /** Session being evaluated */
    sessionId: string;
    /** Persona that generated the response */
    personaId: string;
    /** The user's message */
    userMessage: string;
    /** The AI's response being evaluated */
    aiResponse: string;
    /** Overall quality score (0-100) */
    overallScore: number;
    /** Individual dimension scores */
    dimensions: ResponseEvaluationDimensions;
    /** Detailed feedback from the evaluator */
    feedback: {
        strengths: string[];
        improvements: string[];
        specificIssues: string[];
    };
    /** Should this be flagged for human review? */
    flagged: boolean;
    flagReasons: string[];
    /** Voice consistency metrics */
    voiceConsistency: {
        signaturePhrasesUsed: string[];
        antiPatternsDetected: string[];
        voiceDriftScore: number;
    };
    /** Evaluation metadata */
    metadata: {
        evaluatorModel: string;
        evaluationDurationMs: number;
        contextProvided: string[];
    };
}
/**
 * Expected behavior for a test scenario
 */
export interface ExpectedBehavior {
    /** What the response SHOULD contain/demonstrate */
    shouldInclude: string[];
    /** What the response should NOT contain */
    shouldAvoid: string[];
    /** Persona-specific expectations */
    personaSpecific?: Record<string, {
        shouldInclude: string[];
        shouldAvoid: string[];
    }>;
}
/**
 * A test scenario for evaluating persona behavior
 */
export interface TestScenario {
    /** Unique scenario ID */
    id: string;
    /** Human-readable name */
    name: string;
    /** What this scenario tests */
    category: 'persona_voice' | 'boundary_respect' | 'emotional_intelligence' | 'trust_building' | 'memory_use' | 'safety' | 'helpfulness';
    /** Description of what we're testing */
    description: string;
    /** Setup context (e.g., "User mentioned they don't want to discuss X") */
    setup?: {
        context?: string;
        previousMessages?: Array<{
            role: 'user' | 'assistant';
            content: string;
        }>;
        userProfile?: Record<string, unknown>;
        trustContext?: Record<string, unknown>;
    };
    /** The probe message to send */
    probe: string;
    /** Expected behavior */
    expected: ExpectedBehavior;
    /** Severity if this test fails */
    severity: 'critical' | 'high' | 'medium' | 'low';
    /** Which personas this applies to (empty = all) */
    applicablePersonas: string[];
}
/**
 * Result of running a test scenario
 */
export interface TestScenarioResult {
    scenarioId: string;
    personaId: string;
    timestamp: Date;
    /** The actual response generated */
    response: string;
    /** Did the response meet expectations? */
    passed: boolean;
    /** Detailed scoring */
    scores: {
        includeScore: number;
        avoidScore: number;
        overallScore: number;
    };
    /** Specific findings */
    findings: {
        includedItems: string[];
        missingItems: string[];
        violatedAvoidItems: string[];
    };
    /** Full evaluation if available */
    evaluation?: ResponseEvaluation;
}
/**
 * Aggregated evaluation report for a persona
 */
export interface PersonaEvalReport {
    personaId: string;
    periodStart: Date;
    periodEnd: Date;
    sampleSize: number;
    /** Overall health scores */
    health: {
        overallScore: number;
        voiceConsistencyScore: number;
        emotionalIntelligenceScore: number;
        trustBuildingScore: number;
        safetyScore: number;
    };
    /** Dimension breakdowns */
    dimensionScores: Array<{
        dimension: keyof ResponseEvaluationDimensions;
        average: number;
        min: number;
        max: number;
        trend: 'improving' | 'stable' | 'declining';
    }>;
    /** Test scenario results */
    scenarioResults: Array<{
        category: string;
        passRate: number;
        criticalFailures: number;
    }>;
    /** Top issues found */
    topIssues: Array<{
        issue: string;
        frequency: number;
        severity: 'critical' | 'high' | 'medium' | 'low';
        examples: string[];
    }>;
    /** Signature phrase usage */
    signaturePhraseUsage: Array<{
        phrase: string;
        usageRate: number;
        expectedRate: number;
    }>;
    /** Recommendations */
    recommendations: string[];
}
/**
 * System-wide eval dashboard data
 */
export interface EvalDashboard {
    lastUpdated: Date;
    /** Per-persona health */
    personaHealth: Record<string, {
        score: number;
        trend: 'improving' | 'stable' | 'declining';
        alerts: string[];
    }>;
    /** System-wide metrics */
    systemMetrics: {
        totalEvaluations: number;
        flaggedResponses: number;
        averageScore: number;
        criticalIssues: number;
    };
    /** Recent alerts */
    alerts: Array<{
        timestamp: Date;
        personaId: string;
        severity: 'critical' | 'high' | 'medium' | 'low';
        message: string;
    }>;
    /** A/B test status */
    activeExperiments: Array<{
        id: string;
        name: string;
        startDate: Date;
        status: 'running' | 'completed' | 'paused';
        preliminaryResults?: string;
    }>;
}
/**
 * An A/B test experiment configuration
 */
export interface EvalExperiment {
    id: string;
    name: string;
    description: string;
    /** What we're testing */
    hypothesis: string;
    /** Variants */
    variants: {
        control: {
            name: string;
            description: string;
            config: Record<string, unknown>;
        };
        treatment: {
            name: string;
            description: string;
            config: Record<string, unknown>;
        };
    };
    /** Metrics to measure */
    metrics: string[];
    /** Sample configuration */
    sampling: {
        percentage: number;
        minSampleSize: number;
        maxDurationDays: number;
    };
    /** Status */
    status: 'draft' | 'running' | 'paused' | 'completed' | 'cancelled';
    startDate?: Date;
    endDate?: Date;
    /** Results */
    results?: {
        controlMetrics: Record<string, number>;
        treatmentMetrics: Record<string, number>;
        winner?: 'control' | 'treatment' | 'inconclusive';
        confidence: number;
    };
}
/**
 * Context provided to the evaluator for a single response
 */
export interface EvaluationContext {
    /** The persona being evaluated */
    personaId: string;
    /** Persona's voice fingerprint */
    fingerprint: PersonaVoiceFingerprint;
    /** Conversation history */
    conversationHistory: Array<{
        role: 'user' | 'assistant';
        content: string;
    }>;
    /** User profile if available */
    userProfile?: {
        name?: string;
        relationshipStage?: string;
        totalConversations?: number;
        knownBoundaries?: string[];
        growthAreas?: string[];
    };
    /** Trust context if available */
    trustContext?: {
        activeBoundaries?: string[];
        recentWins?: string[];
        sharedMoments?: string[];
        pendingFollowUps?: string[];
    };
    /** Current emotional context */
    emotionalContext?: {
        userEmotion?: string;
        emotionIntensity?: number;
        distressLevel?: number;
    };
    /** Current topic */
    currentTopic?: string;
    /** Turn number in conversation */
    turnNumber: number;
}
/**
 * Configuration for evaluation sampling
 */
export interface SamplingConfig {
    /** Percentage of conversations to evaluate (0-100) */
    sampleRate: number;
    /** Minimum evaluations per persona per day */
    minPerPersonaPerDay: number;
    /** Maximum evaluations per day (cost control) */
    maxPerDay: number;
    /** Always evaluate if these conditions met */
    alwaysEvaluateIf: {
        userReportedIssue: boolean;
        longConversation: boolean;
        emotionalIntensity: boolean;
        newUser: boolean;
    };
    /** Evaluator model to use */
    evaluatorModel: 'claude-3-5-sonnet' | 'claude-3-opus' | 'gpt-4o';
}
export declare const DEFAULT_SAMPLING_CONFIG: SamplingConfig;
//# sourceMappingURL=types.d.ts.map