/**
 * Cognitive Distortion Detection Engine
 *
 * Phase 18: Detect cognitive distortions in real-time and guide users
 * toward clearer thinking—like having a CBT therapist in your pocket.
 *
 * Detects 15 common cognitive distortions:
 * - Catastrophizing, Mind-Reading, All-or-Nothing
 * - Fortune-Telling, Personalization, Overgeneralization
 * - Mental Filtering, Disqualifying Positive, Should Statements
 * - Emotional Reasoning, Labeling, Magnification
 * - Minimization, Jumping to Conclusions, Blame
 *
 * @module CognitiveDistortionDetector
 */
export type CognitiveDistortion = 'catastrophizing' | 'mind_reading' | 'all_or_nothing' | 'fortune_telling' | 'personalization' | 'overgeneralization' | 'mental_filtering' | 'disqualifying_positive' | 'should_statements' | 'emotional_reasoning' | 'labeling' | 'magnification' | 'minimization' | 'jumping_to_conclusions' | 'blame';
export interface DistortionDetection {
    type: CognitiveDistortion;
    confidence: number;
    triggerPhrase: string;
    userMessage: string;
    gentleChallenge: string;
    reframe: string;
    validation: string;
    patternCount: number;
    relatedDistortions: CognitiveDistortion[];
}
export interface ConversationContext {
    recentTopics?: string[];
    emotionalState?: string;
    relationshipStage?: string;
    previousDistortions?: DistortionDetection[];
}
export interface DistortionPattern {
    patterns: RegExp[];
    keywords: string[];
    contextClues: string[];
    gentleChallenges: string[];
    reframes: string[];
    validations: string[];
    relatedDistortions: CognitiveDistortion[];
}
/**
 * Detect cognitive distortions in a user message.
 */
export declare function detectDistortions(userId: string, message: string, context?: ConversationContext): DistortionDetection[];
/**
 * Get a gentle response for a detected distortion.
 */
export declare function getGentleResponse(detection: DistortionDetection): string;
/**
 * Get distortion statistics for a user.
 */
export declare function getUserDistortionStats(userId: string): {
    topDistortions: Array<{
        type: CognitiveDistortion;
        count: number;
    }>;
    totalDetections: number;
    recentTrend: 'increasing' | 'stable' | 'decreasing';
};
/**
 * Get ANT (Automatic Negative Thoughts) profile for a user.
 * Alias for getUserDistortionStats with legacy-compatible return type.
 */
export declare function getANTProfile(userId: string): {
    totalDetected: number;
    topDistortions: Array<{
        type: CognitiveDistortion;
        count: number;
    }>;
    recentTrend: 'increasing' | 'stable' | 'decreasing';
};
/**
 * Check if a specific distortion type is common for this user.
 */
export declare function isCommonDistortion(userId: string, type: CognitiveDistortion): boolean;
/**
 * Get context injection for LLM.
 */
export declare function getDistortionContextInjection(detections: DistortionDetection[]): string;
export declare const distortionDetector: {
    detect: typeof detectDistortions;
    getResponse: typeof getGentleResponse;
    getStats: typeof getUserDistortionStats;
    isCommon: typeof isCommonDistortion;
    getContextInjection: typeof getDistortionContextInjection;
};
export default distortionDetector;
//# sourceMappingURL=distortion-detector.d.ts.map