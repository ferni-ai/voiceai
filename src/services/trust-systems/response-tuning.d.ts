/**
 * Trust-Aware Response Tuning
 *
 * Dynamically adjusts AI response style based on relationship depth,
 * emotional context, and trust signals.
 *
 * Philosophy: As trust deepens, we can be more direct, more vulnerable,
 * and more real. Early on, we're more careful and gentle.
 *
 * Tuning Dimensions:
 * - Directness (gentle vs. straightforward)
 * - Vulnerability (reserved vs. open)
 * - Challenge (supportive vs. challenging)
 * - Humor (serious vs. playful)
 * - Depth (surface vs. deep)
 *
 * @module ResponseTuning
 */
export type RelationshipStage = 'new' | 'building' | 'established' | 'deep' | 'flourishing';
export interface ResponseStyle {
    /** How directly to communicate (0 = gentle, 1 = straightforward) */
    directness: number;
    /** How much vulnerability to show (0 = reserved, 1 = open) */
    vulnerability: number;
    /** How much to challenge vs support (0 = supportive, 1 = challenging) */
    challenge: number;
    /** How playful vs serious (0 = serious, 1 = playful) */
    humor: number;
    /** How deep to go (0 = surface, 1 = deep) */
    depth: number;
    /** Overall emotional warmth (0 = professional, 1 = warm) */
    warmth: number;
}
export interface TuningContext {
    userId: string;
    relationshipStage: RelationshipStage;
    currentEmotion?: string;
    emotionIntensity?: number;
    topic?: string;
    isVulnerableShare?: boolean;
    isAskingForAdvice?: boolean;
    isCrisis?: boolean;
    recentBoundaryRespected?: boolean;
    trustScore?: number;
    sessionCount?: number;
    /** User's preferred learning style for response adaptation */
    preferredLearningStyle?: string;
    /** Number of recent topics discussed for context depth */
    recentTopicCount?: number;
}
export interface TunedGuidance {
    style: ResponseStyle;
    suggestions: string[];
    avoidances: string[];
    toneWords: string[];
    examplePhrases: string[];
}
/**
 * Calculate tuned response style based on context
 */
export declare function calculateResponseStyle(context: TuningContext): ResponseStyle;
/**
 * Generate complete tuning guidance
 */
export declare function generateTuningGuidance(context: TuningContext): TunedGuidance;
/**
 * Format guidance for LLM injection
 */
export declare function formatGuidanceForLLM(guidance: TunedGuidance): string;
/**
 * Quick style check for a response
 */
export declare function checkResponseAlignment(response: string, guidance: TunedGuidance): {
    aligned: boolean;
    issues: string[];
};
declare const _default: {
    calculateResponseStyle: typeof calculateResponseStyle;
    generateTuningGuidance: typeof generateTuningGuidance;
    formatGuidanceForLLM: typeof formatGuidanceForLLM;
    checkResponseAlignment: typeof checkResponseAlignment;
};
export default _default;
//# sourceMappingURL=response-tuning.d.ts.map