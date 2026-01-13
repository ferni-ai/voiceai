/**
 * Tonal Memory - Remember HOW things were said
 *
 * "Your voice always gets quieter when you mention your sister."
 *
 * Philosophy: Humans remember not just WHAT people said, but HOW they
 * said it. The tremor in someone's voice when discussing their father.
 * The brightness that appears when they mention their garden. These
 * tonal signatures are deeply meaningful.
 *
 * This system tracks:
 * - Emotional signatures per topic
 * - Recurring voice patterns
 * - Changes in how someone talks about something over time
 * - The texture of conversations, not just content
 *
 * Better Than Human: Real friends notice these patterns but often
 * can't articulate them. We can detect AND surface them appropriately.
 *
 * @module TonalMemory
 */
export interface TonalSignature {
    /** What we detected in their voice */
    pitch: 'higher' | 'lower' | 'normal' | 'variable';
    energy: 'louder' | 'quieter' | 'normal' | 'variable';
    pace: 'faster' | 'slower' | 'normal' | 'variable';
    tremor: boolean;
    breathiness: 'more' | 'less' | 'normal';
    /** Primary emotion detected */
    emotion: string;
    /** Confidence in this signature */
    confidence: number;
}
export interface TopicTonalPattern {
    /** The topic/subject this pattern is about */
    topic: string;
    /** Alternative phrasings that refer to the same topic */
    aliases: string[];
    /** Tonal signatures observed when discussing this topic */
    signatures: TonalSignature[];
    /** Number of times we've observed this */
    occurrenceCount: number;
    /** The dominant signature (most common pattern) */
    dominantSignature?: TonalSignature;
    /** How consistent is this pattern? 0-1 */
    consistency: number;
    /** First time we noticed this */
    firstObserved: Date;
    /** Most recent observation */
    lastObserved: Date;
    /** Has this been surfaced to the user? */
    surfaced: boolean;
    /** Human-readable description of the pattern */
    description?: string;
}
export interface TonalInsight {
    /** The topic this insight is about */
    topic: string;
    /** What we noticed */
    observation: string;
    /** Suggested way to mention it */
    surfacingPhrase: string;
    /** How confident are we in this pattern? */
    confidence: number;
    /** How many times have we observed this? */
    occurrences: number;
    /** Is this pattern changing over time? */
    trend?: 'improving' | 'same' | 'worsening';
    /** Should we ask permission before mentioning? */
    askPermission: boolean;
}
export interface TonalMemoryProfile {
    userId: string;
    patterns: TopicTonalPattern[];
    lastUpdated: Date;
    /** Overall tonal baseline */
    baseline?: {
        typicalPitch: 'higher' | 'lower' | 'normal';
        typicalEnergy: 'louder' | 'quieter' | 'normal';
        typicalPace: 'faster' | 'slower' | 'normal';
        updatedAt: Date;
    };
}
/**
 * Record a tonal observation for a topic
 */
export declare function recordTonalObservation(params: {
    userId: string;
    topic: string;
    voiceSignals: {
        pitch?: number;
        energy?: number;
        speechRate?: number;
        tremor?: boolean;
        breathiness?: number;
    };
    emotion?: string;
    confidence?: number;
}): void;
/**
 * Detect recurring tonal patterns that could be surfaced
 */
export declare function detectRecurringPatterns(userId: string): TonalInsight[];
/**
 * Get the best insight to surface
 */
export declare function getBestInsight(userId: string): TonalInsight | null;
/**
 * Mark an insight as surfaced
 */
export declare function markInsightSurfaced(userId: string, topic: string): void;
/**
 * Check if we have a tonal memory for a specific topic
 */
export declare function hasTonalMemory(userId: string, topic: string): boolean;
/**
 * Get description of how user sounds when talking about a topic
 */
export declare function getTonalDescription(userId: string, topic: string): string | null;
export declare function loadTonalProfile(userId: string, data: TonalMemoryProfile): void;
export declare function getTonalProfileForPersistence(userId: string): TonalMemoryProfile | null;
export declare function getAllTopicPatterns(userId: string): TopicTonalPattern[];
export declare function clearSessionState(): void;
/**
 * Clear tonal profile for a user (for testing)
 */
export declare function clearTonalProfile(userId: string): void;
declare const _default: {
    recordTonalObservation: typeof recordTonalObservation;
    detectRecurringPatterns: typeof detectRecurringPatterns;
    getBestInsight: typeof getBestInsight;
    markInsightSurfaced: typeof markInsightSurfaced;
    hasTonalMemory: typeof hasTonalMemory;
    getTonalDescription: typeof getTonalDescription;
    loadTonalProfile: typeof loadTonalProfile;
    getTonalProfileForPersistence: typeof getTonalProfileForPersistence;
    getAllTopicPatterns: typeof getAllTopicPatterns;
    clearSessionState: typeof clearSessionState;
    clearTonalProfile: typeof clearTonalProfile;
};
export default _default;
//# sourceMappingURL=tonal-memory.d.ts.map