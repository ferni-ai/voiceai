/**
 * Behavioral Intelligence - V3.5
 *
 * Detects patterns the user can't see:
 * - Self-sabotage patterns
 * - Emotional baselines
 * - Trigger mapping
 * - Recurring cycles
 *
 * @module services/superhuman/semantic-intelligence/behavioral-intelligence
 */
export interface SelfSabotagePattern {
    id: string;
    userId: string;
    trigger: string;
    behavior: string;
    consequence: string;
    instances: Array<{
        timestamp: Date;
        context: string;
    }>;
    confidence: number;
    frequency: number;
    surfaced: boolean;
    surfacedAt?: Date;
    userAcknowledged: boolean;
    embedding?: number[];
}
export interface EmotionalBaseline {
    userId: string;
    averageValence: number;
    averageEnergy: number;
    emotionVariance: number;
    emotionDistribution: Map<string, number>;
    typicalRange: {
        lowValence: number;
        highValence: number;
        lowEnergy: number;
        highEnergy: number;
    };
    computedAt: Date;
    sampleSize: number;
}
export interface Trigger {
    id: string;
    userId: string;
    triggerType: 'emotional' | 'behavioral';
    triggerPattern: string;
    response: string;
    emotion?: string;
    instances: Array<{
        timestamp: Date;
        context: string;
        intensity: number;
    }>;
    confidence: number;
    sensitivity: number;
}
export interface BehavioralCycle {
    id: string;
    userId: string;
    name: string;
    stages: string[];
    averageDuration: number;
    currentStage?: string;
    occurrences: number;
    lastOccurrence?: Date;
}
/**
 * Record a potential sabotage instance.
 */
export declare function recordPotentialSabotage(userId: string, instance: {
    context: string;
    trigger?: string;
    behavior?: string;
    consequence?: string;
}): Promise<SelfSabotagePattern | null>;
/**
 * Get significant self-sabotage patterns.
 */
export declare function getSabotagePatterns(userId: string): Promise<SelfSabotagePattern[]>;
/**
 * Get unsurfaced patterns to potentially mention.
 */
export declare function getUnsurfacedPatterns(userId: string): Promise<SelfSabotagePattern[]>;
/**
 * Mark a pattern as surfaced.
 */
export declare function markPatternSurfaced(userId: string, patternId: string): Promise<void>;
/**
 * Update emotional baseline with new data.
 */
export declare function updateBaseline(userId: string, data: {
    emotion: string;
    intensity: number;
    valence: number;
}): Promise<void>;
/**
 * Get current baseline.
 */
export declare function getBaseline(userId: string): Promise<EmotionalBaseline | null>;
/**
 * Check if current state is outside baseline.
 */
export declare function checkBaselineDeviation(userId: string, current: {
    valence: number;
    energy: number;
}): Promise<{
    isDeviation: boolean;
    description?: string;
}>;
/**
 * Record a potential trigger.
 */
export declare function recordTrigger(userId: string, trigger: {
    pattern: string;
    response: string;
    emotion?: string;
    context: string;
    intensity: number;
}): Promise<Trigger>;
/**
 * Get known triggers.
 */
export declare function getTriggers(userId: string): Promise<Trigger[]>;
/**
 * Check if text contains a known trigger.
 */
export declare function checkForTriggers(userId: string, text: string): Promise<Trigger[]>;
/**
 * Format behavioral intelligence for LLM context.
 */
export declare function formatBehavioralContext(userId: string, currentContext?: {
    emotion?: string;
    topic?: string;
}): Promise<string>;
export declare function clearBehavioralCache(userId?: string): void;
export declare const behavioralIntelligence: {
    recordSabotage: typeof recordPotentialSabotage;
    getPatterns: typeof getSabotagePatterns;
    getUnsurfaced: typeof getUnsurfacedPatterns;
    markSurfaced: typeof markPatternSurfaced;
    updateBaseline: typeof updateBaseline;
    getBaseline: typeof getBaseline;
    checkDeviation: typeof checkBaselineDeviation;
    recordTrigger: typeof recordTrigger;
    getTriggers: typeof getTriggers;
    checkTriggers: typeof checkForTriggers;
    format: typeof formatBehavioralContext;
    clearCache: typeof clearBehavioralCache;
};
export default behavioralIntelligence;
//# sourceMappingURL=behavioral-intelligence.d.ts.map