/**
 * Cognitive Reframe Engine
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Offers multiple ways to reframe unhelpful thought patterns.
 * Not about positive thinking - about accurate thinking.
 *
 * Philosophy:
 * - Thoughts aren't facts
 * - Multiple perspectives exist
 * - Reframing is skill-building, not dismissing
 *
 * @module CognitiveReframes
 */
export type DistortionType = 'all_or_nothing' | 'catastrophizing' | 'mind_reading' | 'fortune_telling' | 'should_statements' | 'emotional_reasoning' | 'personalization' | 'overgeneralization' | 'mental_filter' | 'disqualifying_positive' | 'labeling';
export interface CognitiveReframe {
    id: string;
    distortionType: DistortionType;
    originalThought: string;
    reframes: ReframeOption[];
    selectedReframe?: string;
    helpful: boolean | null;
}
export interface ReframeOption {
    reframe: string;
    technique: string;
    rationale: string;
}
export interface ReframeProfile {
    userId: string;
    reframes: CognitiveReframe[];
    distortionFrequency: Map<DistortionType, number>;
    helpfulReframes: string[];
}
/**
 * Detect cognitive distortions in text
 */
export declare function detectDistortions(text: string): Array<{
    type: DistortionType;
    confidence: number;
    trigger: string;
}>;
/**
 * Generate multiple reframe options for a thought
 */
export declare function generateReframes(userId: string, originalThought: string, distortionType: DistortionType): CognitiveReframe;
/**
 * Record whether a reframe was helpful
 */
export declare function recordReframeFeedback(userId: string, reframeId: string, helpful: boolean, selectedTechnique?: string): void;
/**
 * Get most common distortions for a user
 */
export declare function getCommonDistortions(userId: string): Array<{
    type: DistortionType;
    count: number;
}>;
/**
 * Build LLM context for cognitive reframing
 */
export declare function buildReframeContext(userId: string, detectedDistortions?: Array<{
    type: DistortionType;
    trigger: string;
}>): string | null;
declare const _default: {
    detectDistortions: typeof detectDistortions;
    generateReframes: typeof generateReframes;
    recordReframeFeedback: typeof recordReframeFeedback;
    getCommonDistortions: typeof getCommonDistortions;
    buildReframeContext: typeof buildReframeContext;
};
export default _default;
//# sourceMappingURL=cognitive-reframes.d.ts.map