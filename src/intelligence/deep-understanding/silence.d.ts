/**
 * Silence Intelligence System
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Understanding what different silences MEAN - not just detecting pauses,
 * but interpreting them. A 3-second silence after "I've been thinking about
 * leaving my job" is VERY different from silence after "What's for dinner?"
 *
 * Real friends understand the weight of silence. They know when to wait,
 * when to gently prompt, and when to change the subject entirely.
 *
 * This is superhuman because most humans rush to fill silence uncomfortably.
 * Ferni understands silence as communication.
 */
export type SilenceType = 'processing' | 'emotional' | 'resistant' | 'confused' | 'reflective' | 'dissociating' | 'comfortable' | 'searching' | 'testing' | 'unknown';
export type SilenceResponse = 'wait' | 'gentle_prompt' | 'reflect_back' | 'change_topic' | 'ground_them' | 'validate' | 'offer_space' | 'check_in';
export interface SilenceAnalysis {
    /** Type of silence detected */
    type: SilenceType;
    /** Duration in milliseconds */
    duration: number;
    /** Confidence in classification (0-1) */
    confidence: number;
    /** What preceded the silence */
    precedingContent: {
        text: string;
        emotion: string;
        emotionIntensity: number;
        topic: string;
        wasQuestion: boolean;
        wasVulnerable: boolean;
        wasHeavy: boolean;
    };
    /** Recommended response */
    suggestedResponse: SilenceResponse;
    /** How long to wait before responding (ms) */
    waitDuration: number;
    /** If prompting, what to say */
    promptSuggestion?: string;
    /** Additional guidance for LLM */
    guidance: string;
}
export interface SilencePattern {
    /** User ID */
    userId: string;
    /** Average silence duration when processing */
    avgProcessingDuration: number;
    /** Average silence duration when emotional */
    avgEmotionalDuration: number;
    /** How they typically break silence */
    breakPatterns: {
        selfInitiated: number;
        needsPrompt: number;
        changesSubject: number;
    };
    /** Topics that cause longer silences */
    heavyTopics: string[];
    /** Times when they're more contemplative */
    contemplativeHours: number[];
    /** Total silences observed */
    observationCount: number;
}
/**
 * Analyze a silence based on context
 */
export declare function analyzeSilence(durationMs: number, precedingText: string, precedingEmotion: string, precedingEmotionIntensity: number, precedingTopics: string[], wasQuestion: boolean, userPatterns?: SilencePattern): SilenceAnalysis;
/**
 * Get silence patterns for a user
 */
export declare function getSilencePattern(userId: string): SilencePattern | undefined;
/**
 * Record a silence observation
 */
export declare function recordSilence(userId: string, analysis: SilenceAnalysis, howBroken: 'self' | 'prompted' | 'redirect'): void;
/**
 * Format silence analysis for prompt injection
 */
export declare function formatSilenceForPrompt(analysis: SilenceAnalysis): string;
/**
 * Import a silence pattern into memory (for persistence)
 */
export declare function importSilencePattern(pattern: SilencePattern): void;
/**
 * Reset all silence intelligence state (for testing)
 */
export declare function resetSilenceIntelligence(): void;
declare const _default: {
    analyzeSilence: typeof analyzeSilence;
    getSilencePattern: typeof getSilencePattern;
    recordSilence: typeof recordSilence;
    formatSilenceForPrompt: typeof formatSilenceForPrompt;
    resetSilenceIntelligence: typeof resetSilenceIntelligence;
};
export default _default;
//# sourceMappingURL=silence.d.ts.map