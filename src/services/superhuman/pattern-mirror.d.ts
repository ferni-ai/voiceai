/**
 * Unspoken Pattern Mirror
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Surfaces patterns users can't see in themselves.
 * "I noticed you light up every time you talk about teaching,
 * but you haven't mentioned it in weeks. What's going on there?"
 *
 * @module PatternMirror
 */
export type PatternCycle = 'weekly' | 'monthly' | 'seasonal' | 'annual';
export type TopicFrequency = 'daily' | 'weekly' | 'often' | 'rare' | 'never';
export interface TopicEnergy {
    topic: string;
    avgEnergyIncrease: number;
    mentionCount: number;
    lastMentioned: Date;
    voiceMarkersWhenDiscussing: {
        avgPitch: number;
        avgEnergy: number;
        avgSpeechRate: number;
    };
    sentiment: 'positive' | 'negative' | 'mixed' | 'neutral';
}
export interface CyclicalPattern {
    id: string;
    pattern: string;
    cycle: PatternCycle;
    dataPoints: number;
    confidence: number;
    triggers?: string[];
    nextExpected?: Date;
    surfacedToUser: boolean;
    surfacedAt?: Date;
    userReaction?: 'surprised' | 'recognized' | 'dismissed';
}
export interface FadingTopic {
    topic: string;
    peakFrequency: TopicFrequency;
    peakPeriod: {
        start: Date;
        end: Date;
    };
    currentFrequency: 'rare' | 'never';
    lastMentioned: Date;
    daysSinceLastMention: number;
    wasEnergizing: boolean;
    possibleReasons?: string[];
    surfacedToUser: boolean;
}
export interface WordVoiceMismatch {
    timestamp: Date;
    whatTheySaid: string;
    howTheySaidIt: string;
    topic: string;
    mismatchType: 'enthusiasm_flat' | 'positive_sad' | 'fine_stressed' | 'other';
    surfacedToUser: boolean;
}
export interface PatternInsight {
    type: 'faded_energizer' | 'cyclical_pattern' | 'voice_mismatch' | 'energy_correlation';
    insight: string;
    gentleProbe: string;
    topic?: string;
    patternId?: string;
    priority: number;
}
export interface PatternMirrorProfile {
    userId: string;
    /** Topics that light them up */
    energizingTopics: TopicEnergy[];
    /** Topics that drain them */
    drainingTopics: TopicEnergy[];
    /** Cyclical patterns they don't notice */
    cyclicalPatterns: CyclicalPattern[];
    /** Topics that have faded from conversations */
    fadingTopics: FadingTopic[];
    /** Contradictions between words and voice */
    wordVoiceMismatches: WordVoiceMismatch[];
    /** All topic mentions for tracking */
    topicHistory: Array<{
        topic: string;
        timestamp: Date;
        energy: number;
    }>;
    updatedAt: Date;
}
/**
 * Record topic + voice energy correlation.
 * Call after each topic is discussed.
 */
export declare function recordTopicEnergy(userId: string, data: {
    topic: string;
    voiceEnergy: number;
    baselineEnergy: number;
    voiceMarkers?: {
        pitch: number;
        speechRate: number;
    };
    sentiment?: 'positive' | 'negative' | 'mixed' | 'neutral';
}): void;
/**
 * Record a mismatch between words and voice.
 */
export declare function recordWordVoiceMismatch(userId: string, data: {
    whatTheySaid: string;
    howTheySaidIt: string;
    topic: string;
    mismatchType: 'enthusiasm_flat' | 'positive_sad' | 'fine_stressed' | 'other';
}): void;
/**
 * Record a cyclical pattern.
 */
export declare function recordCyclicalPattern(userId: string, data: {
    pattern: string;
    cycle: PatternCycle;
    triggers?: string[];
}): void;
/**
 * Get the most impactful pattern insight to share with user.
 */
export declare function getPatternToSurface(userId: string): PatternInsight | null;
/**
 * Mark an insight as surfaced.
 */
export declare function markInsightSurfaced(userId: string, insightType: PatternInsight['type'], identifier: string, // topic or patternId
userReaction?: 'surprised' | 'recognized' | 'dismissed'): void;
/**
 * Build context for LLM injection.
 */
export declare function buildPatternMirrorContext(userId: string): string;
export declare function savePatternProfile(userId: string): Promise<void>;
export declare function loadPatternProfile(userId: string): Promise<PatternMirrorProfile | null>;
export declare function getPatternProfile(userId: string): PatternMirrorProfile | null;
export declare const patternMirror: {
    recordTopicEnergy: typeof recordTopicEnergy;
    recordWordVoiceMismatch: typeof recordWordVoiceMismatch;
    recordCyclicalPattern: typeof recordCyclicalPattern;
    getPatternToSurface: typeof getPatternToSurface;
    markInsightSurfaced: typeof markInsightSurfaced;
    buildPatternMirrorContext: typeof buildPatternMirrorContext;
    savePatternProfile: typeof savePatternProfile;
    loadPatternProfile: typeof loadPatternProfile;
    getPatternProfile: typeof getPatternProfile;
};
export default patternMirror;
//# sourceMappingURL=pattern-mirror.d.ts.map