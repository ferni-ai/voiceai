/**
 * Cognitive Fingerprint - Better Than Human v4
 *
 * > "We know your unique cognitive signature."
 *
 * SUPERHUMAN CAPABILITY: Learn each user's unique cognitive patterns
 * for hyper-personalized prediction that no generic model can match.
 *
 * Every person has patterns in:
 * - How they make decisions
 * - How they respond to stress
 * - How quickly they change
 * - What their emotional precursors are
 * - How they communicate readiness
 * - What deflection looks like for THEM
 *
 * No human friend can track this many dimensions over time with precision.
 *
 * @module intelligence/predictive/cognitive-fingerprint
 */
/** Decision-making styles */
export type DecisionStyle = 'analytical' | 'intuitive' | 'social_validation' | 'procrastinate_leap' | 'incremental' | 'deadline_driven' | 'values_based' | 'emotion_driven';
/** Stress response patterns */
export type StressResponse = 'fight' | 'flight' | 'freeze' | 'fawn' | 'analyze' | 'numb' | 'distract' | 'express';
/** Learning/growth styles */
export type LearningStyle = 'conceptual' | 'experiential' | 'social' | 'reflective' | 'structured' | 'exploratory';
/** How they signal readiness for growth */
export type ReadinessSignal = 'asking_questions' | 'future_talk' | 'past_acceptance' | 'energy_shift' | 'direct_statement' | 'action_taking' | 'vulnerability' | 'boundary_setting' | 'letting_go';
/** Full cognitive fingerprint */
export interface CognitiveFingerprint {
    userId: string;
    decisionStyle: {
        primary: DecisionStyle;
        secondary?: DecisionStyle;
        confidence: number;
        observations: number;
    };
    stressResponse: {
        primary: StressResponse;
        secondary?: StressResponse;
        recoveryTime: number;
        escalationPattern: string[];
        deEscalationTriggers: string[];
        confidence: number;
        observations: number;
    };
    changeVelocity: {
        /** How fast they change when ready (0-1) */
        speed: number;
        /** How long from insight to action (hours) */
        insightToAction: number;
        /** How long to process changes (days) */
        integrationTime: number;
        /** Whether they prefer gradual or sudden change */
        preference: 'gradual' | 'sudden' | 'context_dependent';
        confidence: number;
    };
    emotionalPatterns: {
        /** What precedes specific emotions */
        precursors: Map<string, string[]>;
        /** What signals they're recovering */
        recoverySignals: string[];
        /** How much they can handle before overwhelm (0-1) */
        overwhelmThreshold: number;
        /** How they typically cycle through emotions */
        typicalCycles: string[][];
        /** Emotions they tend to avoid */
        avoidedEmotions: string[];
        confidence: number;
    };
    communicationPatterns: {
        /** How they deflect from topics */
        deflectionStyle: string;
        /** How they signal readiness to go deep */
        readinessSignals: ReadinessSignal[];
        /** What builds trust with them specifically */
        trustBuilders: string[];
        /** What breaks trust */
        trustBreakers: string[];
        /** Preferred communication tone */
        preferredTone: 'warm' | 'direct' | 'gentle' | 'challenging' | 'playful';
        /** How much space they need */
        spaceNeeds: 'minimal' | 'moderate' | 'significant';
        confidence: number;
    };
    growthPatterns: {
        /** How they learn best */
        learningStyle: LearningStyle;
        /** How they resist growth */
        resistancePatterns: string[];
        /** What breaks through resistance */
        breakthroughCatalysts: string[];
        /** Time to integrate change (days) */
        integrationTime: number;
        /** How many things they can work on at once */
        concurrentCapacity: number;
        confidence: number;
    };
    temporalPatterns: {
        /** Best time for deep conversations */
        optimalConversationTimes: Array<{
            dayOfWeek: number;
            hour: number;
            effectiveness: number;
        }>;
        /** Energy patterns through week */
        weeklyEnergyPattern: number[];
        /** Seasonal patterns */
        seasonalPatterns: Array<{
            season: string;
            tendency: string;
        }>;
        confidence: number;
    };
    vulnerabilityPatterns: {
        /** How they show vulnerability */
        expressionStyle: 'direct' | 'indirect' | 'physical' | 'deflected';
        /** What makes vulnerability safe */
        safetyFactors: string[];
        /** How long it takes to open up (minutes in conversation) */
        warmupTime: number;
        /** Topics that are harder to be vulnerable about */
        protectedTopics: string[];
        confidence: number;
    };
    lastUpdated: number;
    totalObservations: number;
    fingerprintVersion: number;
}
/** Observation for learning fingerprint */
export interface FingerprintObservation {
    type: ObservationType;
    value: string | number;
    context?: string;
    confidence: number;
    timestamp: number;
}
export type ObservationType = 'decision_made' | 'stress_response' | 'change_velocity' | 'emotional_precursor' | 'recovery_signal' | 'deflection_observed' | 'readiness_signal' | 'trust_moment' | 'resistance_observed' | 'breakthrough_catalyst' | 'vulnerability_moment' | 'conversation_effectiveness';
/**
 * Record an observation about user's cognitive patterns
 *
 * @param userId - User ID
 * @param observation - What was observed
 */
export declare function recordObservation(userId: string, observation: Omit<FingerprintObservation, 'timestamp'>): void;
/**
 * Record a decision-making observation
 */
export declare function recordDecision(userId: string, decision: {
    style: DecisionStyle;
    timeToDecision: number;
    outcome?: 'satisfied' | 'regret' | 'neutral';
    context?: string;
}): void;
/**
 * Record a stress response observation
 */
export declare function recordStressResponse(userId: string, response: {
    style: StressResponse;
    stressLevel: number;
    trigger?: string;
    recoveryTime?: number;
}): void;
/**
 * Record a change/growth observation
 */
export declare function recordChangeEvent(userId: string, event: {
    type: 'insight' | 'action' | 'integration';
    timeSincePrevious?: number;
    catalyst?: string;
    resistance?: string;
}): void;
/**
 * Record a conversation effectiveness observation
 */
export declare function recordConversationEffectiveness(userId: string, data: {
    dayOfWeek: number;
    hour: number;
    effectiveness: number;
    tone: 'warm' | 'direct' | 'gentle' | 'challenging' | 'playful';
    depthReached: 'surface' | 'moderate' | 'deep';
}): void;
/**
 * Record a vulnerability moment
 */
export declare function recordVulnerabilityMoment(userId: string, data: {
    style: 'direct' | 'indirect' | 'physical' | 'deflected';
    topic: string;
    warmupMinutes: number;
    safetyFactor?: string;
}): void;
/**
 * Get the cognitive fingerprint for a user
 *
 * @param userId - User ID
 * @returns Cognitive fingerprint
 */
export declare function getFingerprint(userId: string): CognitiveFingerprint | null;
/**
 * Get specific aspect of fingerprint with confidence check
 *
 * @param userId - User ID
 * @param aspect - Which aspect to get
 * @returns Aspect value with confidence, or null if unreliable
 */
export declare function getFingerprintAspect<K extends keyof CognitiveFingerprint>(userId: string, aspect: K): {
    value: CognitiveFingerprint[K];
    confidence: number;
} | null;
/**
 * Get personalized prediction adjustments based on fingerprint
 *
 * @param userId - User ID
 * @returns Adjustments to apply to predictions
 */
export declare function getPredictionAdjustments(userId: string): {
    emotionalVelocity: number;
    changeReadiness: number;
    vulnerabilityOpenness: number;
    stressResilience: number;
    optimalTone: string;
    avoidPatterns: string[];
};
/**
 * Build cognitive fingerprint context for LLM injection
 *
 * @param userId - User ID
 * @returns Context string for prompt injection
 */
export declare function buildFingerprintContext(userId: string): string;
export declare const cognitiveFingerprint: {
    recordObservation: typeof recordObservation;
    recordDecision: typeof recordDecision;
    recordStressResponse: typeof recordStressResponse;
    recordChangeEvent: typeof recordChangeEvent;
    recordConversationEffectiveness: typeof recordConversationEffectiveness;
    recordVulnerabilityMoment: typeof recordVulnerabilityMoment;
    getFingerprint: typeof getFingerprint;
    getFingerprintAspect: typeof getFingerprintAspect;
    getPredictionAdjustments: typeof getPredictionAdjustments;
    buildFingerprintContext: typeof buildFingerprintContext;
};
export default cognitiveFingerprint;
//# sourceMappingURL=cognitive-fingerprint.d.ts.map