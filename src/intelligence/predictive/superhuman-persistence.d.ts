/**
 * Superhuman Capabilities Persistence Layer - Better Than Human v4
 *
 * Persists the 8 superhuman predictive capabilities to Firestore.
 *
 * WHAT GETS PERSISTED:
 * 1. Avoidance Prediction - Topics they avoid, deflection patterns
 * 2. Breakthrough Proximity - Active breakthrough tracks, past breakthroughs
 * 3. Pre-Trajectory Detection - Precursor patterns, baselines, trajectory history
 * 4. Conversation Preparation - Topic history, needs patterns, temporal patterns
 * 5. Cognitive Fingerprint - Decision style, stress response, change velocity
 * 6. Ripple Effect Prediction - Domain states, influence patterns, event history
 * 7. Life Phase Prediction - Phase history, phase patterns, observations
 * 8. Intervention Timing - Timing patterns, intervention outcomes
 *
 * @module intelligence/predictive/superhuman-persistence
 */
export interface AvoidancePersistenceData {
    avoidedTopics: Array<{
        topic: string;
        firstDetected: number;
        lastDeflection: number;
        deflectionCount: number;
        primaryDeflectionStyle: string;
        triggerTopics: string[];
        emotionalStateOnDeflection: string[];
        lastMention?: number;
    }>;
    resolvedTopics: string[];
    avoidanceTendency: number;
    pressureBuildupRate: number;
    lastUpdated: number;
    [key: string]: unknown;
}
export interface BreakthroughPersistenceData {
    activeTracks: Array<{
        id: string;
        topic: string;
        indicators: Array<{
            type: string;
            strength: number;
            timestamp: number;
            content: string;
        }>;
        blockages: Array<{
            type: string;
            strength: number;
            description: string;
        }>;
        startedAt: number;
        lastActivity: number;
    }>;
    pastBreakthroughs: Array<{
        topic: string;
        type: string;
        timestamp: number;
        precursorIndicators: string[];
        catalystType: string;
        timeFromFirstIndicator: number;
        impact: number;
    }>;
    insightReadiness: number;
    lastUpdated: number;
}
export interface TrajectoryPersistenceData {
    patterns: Array<{
        trajectory: string;
        signals: Array<{
            signal: string;
            direction: string;
            typicalLeadTime: number;
            reliability: number;
            weight: number;
        }>;
        accuracy: number;
        observationCount: number;
    }>;
    baselines: Array<{
        signal: string;
        mean: number;
        stdDev: number;
        recentTrend: number;
        sampleCount: number;
    }>;
    trajectoryHistory: Array<{
        trajectory: string;
        startedAt: number;
        precursorsObserved: string[];
        leadTimeMs: number;
        severity: number;
        duration: number;
    }>;
    vulnerabilities: Array<{
        trajectory: string;
        score: number;
    }>;
    lastUpdated: number;
}
export interface ConversationPrepPersistenceData {
    topicHistory: Array<{
        topic: string;
        category: string;
        timestamp: number;
        emotionalIntensity: number;
        resolved: boolean;
        followUpNeeded: boolean;
        userInitiated: boolean;
    }>;
    needsHistory: Array<{
        timestamp: number;
        dayOfWeek: number;
        hourOfDay: number;
        primaryNeed: string;
    }>;
    recurringTopics: Array<{
        topic: string;
        frequency: number;
        avgIntensity: number;
        typicalDayOfWeek: number[];
        resolutionRate: number;
    }>;
    temporalPatterns: Array<{
        dayOfWeek?: number;
        timeOfDay?: string;
        likelyTopics: string[];
        likelyNeeds: string[];
        confidence: number;
    }>;
    lastUpdated: number;
}
export interface CognitiveFingerprintPersistenceData {
    decisionStyle: {
        primary: string;
        secondary?: string;
        confidence: number;
        observations: number;
    };
    stressResponse: {
        primary: string;
        secondary?: string;
        recoveryTime: number;
        escalationPattern: string[];
        deEscalationTriggers: string[];
        confidence: number;
        observations: number;
    };
    changeVelocity: {
        speed: number;
        insightToAction: number;
        integrationTime: number;
        preference: string;
        confidence: number;
    };
    communicationPatterns: {
        deflectionStyle: string;
        readinessSignals: string[];
        trustBuilders: string[];
        trustBreakers: string[];
        preferredTone: string;
        spaceNeeds: string;
        confidence: number;
    };
    growthPatterns: {
        learningStyle: string;
        resistancePatterns: string[];
        breakthroughCatalysts: string[];
        integrationTime: number;
        concurrentCapacity: number;
        confidence: number;
    };
    temporalPatterns: {
        optimalConversationTimes: Array<{
            dayOfWeek: number;
            hour: number;
            effectiveness: number;
        }>;
        weeklyEnergyPattern: number[];
        confidence: number;
    };
    vulnerabilityPatterns: {
        expressionStyle: string;
        safetyFactors: string[];
        warmupTime: number;
        protectedTopics: string[];
        confidence: number;
    };
    totalObservations: number;
    lastUpdated: number;
    [key: string]: unknown;
}
export interface RipplePersistenceData {
    domainStates: Array<{
        domain: string;
        health: number;
        stability: number;
        trend: string;
        lastUpdated: number;
    }>;
    influencePatterns: Array<{
        sourceDomain: string;
        targetDomain: string;
        eventType: string;
        typicalEffect: string;
        typicalMagnitude: number;
        typicalDelay: number;
        observationCount: number;
        reliability: number;
    }>;
    eventHistory: Array<{
        domain: string;
        eventType: string;
        magnitude: number;
        description: string;
        timestamp: number;
    }>;
    lastUpdated: number;
}
export interface LifePhasePersistenceData {
    currentPhase: string;
    phaseStarted: number;
    phaseHistory: Array<{
        fromPhase: string;
        toPhase: string;
        timestamp: number;
        duration: number;
        smoothness: string;
    }>;
    phasePatterns: {
        typicalDurations: Array<{
            phase: string;
            duration: number;
        }>;
        commonSequences: Array<{
            from: string;
            to: string;
            probability: number;
        }>;
    };
    phaseTendencies: Array<{
        phase: string;
        score: number;
    }>;
    lastUpdated: number;
    [key: string]: unknown;
}
export interface InterventionTimingPersistenceData {
    patterns: Array<{
        interventionType: string;
        optimalConditions: {
            emotionalStates: string[];
            timeOfDay: string[];
            dayOfWeek: number[];
            contraindications: string[];
        };
        successRate: number;
        observations: number;
        confidence: number;
        lastUpdated: number;
    }>;
    outcomes: Array<{
        interventionType: string;
        timestamp: number;
        conditions: {
            emotionalState?: string;
            topic?: string;
            timeOfDay: string;
            dayOfWeek: number;
        };
        outcome: string;
        responseType: string;
        effectivenessScore: number;
    }>;
    globalPreferences: {
        bestDaysForDeepWork: number[];
        bestTimeForChallenge: string;
        needsWarmupTime: boolean;
        sensitiveToTiming: boolean;
    };
    lastUpdated: number;
}
export declare function saveAvoidanceState(userId: string, data: AvoidancePersistenceData): Promise<void>;
export declare function loadAvoidanceState(userId: string): Promise<AvoidancePersistenceData | null>;
export declare function saveBreakthroughState(userId: string, data: BreakthroughPersistenceData): Promise<void>;
export declare function loadBreakthroughState(userId: string): Promise<BreakthroughPersistenceData | null>;
export declare function saveTrajectoryState(userId: string, data: TrajectoryPersistenceData): Promise<void>;
export declare function loadTrajectoryState(userId: string): Promise<TrajectoryPersistenceData | null>;
export declare function saveConversationPrepState(userId: string, data: ConversationPrepPersistenceData): Promise<void>;
export declare function loadConversationPrepState(userId: string): Promise<ConversationPrepPersistenceData | null>;
export declare function saveCognitiveFingerprintState(userId: string, data: CognitiveFingerprintPersistenceData): Promise<void>;
export declare function loadCognitiveFingerprintState(userId: string): Promise<CognitiveFingerprintPersistenceData | null>;
export declare function saveRippleState(userId: string, data: RipplePersistenceData): Promise<void>;
export declare function loadRippleState(userId: string): Promise<RipplePersistenceData | null>;
export declare function saveLifePhaseState(userId: string, data: LifePhasePersistenceData): Promise<void>;
export declare function loadLifePhaseState(userId: string): Promise<LifePhasePersistenceData | null>;
export declare function saveInterventionTimingState(userId: string, data: InterventionTimingPersistenceData): Promise<void>;
export declare function loadInterventionTimingState(userId: string): Promise<InterventionTimingPersistenceData | null>;
export declare function markSuperhumanDirty(userId: string): void;
export declare function flushSuperhumanState(userId: string, getters: {
    getAvoidance: (userId: string) => AvoidancePersistenceData | null;
    getBreakthrough: (userId: string) => BreakthroughPersistenceData | null;
    getTrajectory: (userId: string) => TrajectoryPersistenceData | null;
    getConversationPrep: (userId: string) => ConversationPrepPersistenceData | null;
    getCognitiveFingerprint: (userId: string) => CognitiveFingerprintPersistenceData | null;
    getRipple: (userId: string) => RipplePersistenceData | null;
    getLifePhase: (userId: string) => LifePhasePersistenceData | null;
    getInterventionTiming: (userId: string) => InterventionTimingPersistenceData | null;
}): Promise<void>;
export declare function flushAllDirtySuperhumanUsers(getters: Parameters<typeof flushSuperhumanState>[1]): Promise<{
    flushed: number;
    errors: number;
}>;
export declare const superhumanPersistence: {
    saveAvoidance: typeof saveAvoidanceState;
    loadAvoidance: typeof loadAvoidanceState;
    saveBreakthrough: typeof saveBreakthroughState;
    loadBreakthrough: typeof loadBreakthroughState;
    saveTrajectory: typeof saveTrajectoryState;
    loadTrajectory: typeof loadTrajectoryState;
    saveConversationPrep: typeof saveConversationPrepState;
    loadConversationPrep: typeof loadConversationPrepState;
    saveCognitiveFingerprint: typeof saveCognitiveFingerprintState;
    loadCognitiveFingerprint: typeof loadCognitiveFingerprintState;
    saveRipple: typeof saveRippleState;
    loadRipple: typeof loadRippleState;
    saveLifePhase: typeof saveLifePhaseState;
    loadLifePhase: typeof loadLifePhaseState;
    saveInterventionTiming: typeof saveInterventionTimingState;
    loadInterventionTiming: typeof loadInterventionTimingState;
    markDirty: typeof markSuperhumanDirty;
    flushUser: typeof flushSuperhumanState;
    flushAllDirty: typeof flushAllDirtySuperhumanUsers;
};
export default superhumanPersistence;
//# sourceMappingURL=superhuman-persistence.d.ts.map