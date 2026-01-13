/**
 * Self-Awareness Intelligence - V3.7
 *
 * Helps users see themselves more clearly:
 * - Blind spot identification
 * - Self-perception gaps
 * - Values-behavior alignment
 * - Cognitive distortion tracking
 *
 * @module services/superhuman/semantic-intelligence/self-awareness
 */
export interface BlindSpot {
    id: string;
    userId: string;
    pattern: string;
    evidence: string[];
    category: 'self_perception' | 'impact_on_others' | 'patterns' | 'avoidance';
    confidence: number;
    occurrences: number;
    surfaced: boolean;
    surfacedAt?: Date;
    userResponse?: 'acknowledged' | 'dismissed' | 'exploring';
    created: Date;
    lastSeen: Date;
}
export interface SelfPerceptionGap {
    id: string;
    userId: string;
    selfStatement: string;
    observedBehavior: string;
    gapDescription: string;
    gapSeverity: number;
    evidence: Array<{
        type: 'self_statement' | 'behavior';
        text: string;
        timestamp: Date;
    }>;
    surfaced: boolean;
    created: Date;
    updated: Date;
}
export interface ValuesBehaviorAlignment {
    userId: string;
    statedValues: Array<{
        value: string;
        statedAt: Date;
        context: string;
    }>;
    alignmentScores: Map<string, {
        value: string;
        alignedBehaviors: number;
        misalignedBehaviors: number;
        score: number;
        examples: string[];
    }>;
    overallAlignment: number;
    lastUpdated: Date;
}
export interface CognitiveDistortionProfile {
    userId: string;
    distortions: Map<string, {
        count: number;
        recentExamples: string[];
        lastSeen: Date;
    }>;
    primaryDistortion?: string;
    reductionTrend: number;
    lastUpdated: Date;
}
export type CognitiveDistortion = 'all_or_nothing' | 'catastrophizing' | 'mind_reading' | 'fortune_telling' | 'should_statements' | 'personalization' | 'overgeneralization' | 'mental_filtering' | 'discounting_positives' | 'emotional_reasoning';
/**
 * Record potential blind spot evidence.
 */
export declare function recordBlindSpotEvidence(userId: string, evidence: {
    pattern: string;
    context: string;
    category: BlindSpot['category'];
}): Promise<BlindSpot>;
/**
 * Get significant blind spots.
 */
export declare function getBlindSpots(userId: string): Promise<BlindSpot[]>;
/**
 * Get unsurfaced blind spots to potentially mention.
 */
export declare function getUnsurfacedBlindSpots(userId: string): Promise<BlindSpot[]>;
/**
 * Mark blind spot as surfaced.
 */
export declare function markBlindSpotSurfaced(userId: string, blindSpotId: string, response?: BlindSpot['userResponse']): Promise<void>;
/**
 * Record a self-perception statement.
 */
export declare function recordSelfPerception(userId: string, statement: string, context: string): Promise<void>;
/**
 * Record behavior that might contradict self-perception.
 */
export declare function recordBehavior(userId: string, behavior: string, context: string): Promise<SelfPerceptionGap | null>;
/**
 * Get significant self-perception gaps.
 */
export declare function getGaps(userId: string): Promise<SelfPerceptionGap[]>;
/**
 * Record a stated value.
 */
export declare function recordStatedValue(userId: string, value: string, context: string): Promise<void>;
/**
 * Record value-aligned or misaligned behavior.
 */
export declare function recordValueBehavior(userId: string, value: string, behavior: string, aligned: boolean): Promise<void>;
/**
 * Get values alignment profile.
 */
export declare function getValuesAlignment(userId: string): Promise<ValuesBehaviorAlignment | null>;
/**
 * Get misaligned values.
 */
export declare function getMisalignedValues(userId: string): Promise<Array<{
    value: string;
    score: number;
    examples: string[];
}>>;
/**
 * Detect cognitive distortions in text.
 */
export declare function detectDistortions(text: string): CognitiveDistortion[];
/**
 * Record detected distortions.
 */
export declare function recordDistortions(userId: string, text: string): Promise<CognitiveDistortion[]>;
/**
 * Get distortion profile.
 */
export declare function getDistortionProfile(userId: string): Promise<CognitiveDistortionProfile | null>;
/**
 * Format self-awareness intelligence for LLM context.
 */
export declare function formatSelfAwarenessContext(userId: string): Promise<string>;
export declare function clearSelfAwarenessCache(userId?: string): void;
export declare const selfAwareness: {
    recordBlindSpot: typeof recordBlindSpotEvidence;
    getBlindSpots: typeof getBlindSpots;
    getUnsurfaced: typeof getUnsurfacedBlindSpots;
    markSurfaced: typeof markBlindSpotSurfaced;
    recordPerception: typeof recordSelfPerception;
    recordBehavior: typeof recordBehavior;
    getGaps: typeof getGaps;
    recordValue: typeof recordStatedValue;
    recordValueBehavior: typeof recordValueBehavior;
    getAlignment: typeof getValuesAlignment;
    getMisaligned: typeof getMisalignedValues;
    detectDistortions: typeof detectDistortions;
    recordDistortions: typeof recordDistortions;
    getDistortions: typeof getDistortionProfile;
    format: typeof formatSelfAwarenessContext;
    clearCache: typeof clearSelfAwarenessCache;
};
export default selfAwareness;
//# sourceMappingURL=self-awareness.d.ts.map