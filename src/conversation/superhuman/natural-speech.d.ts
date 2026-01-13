/**
 * Natural Speech Patterns
 *
 * Fillers, self-corrections, and thinking out loud - the "humanness" layer.
 *
 * Real people don't speak in perfect paragraphs. They pause, correct themselves,
 * and think out loud. This module adds those natural speech patterns.
 *
 * @module conversation/superhuman/natural-speech
 */
export interface SpeechModification {
    type: ModificationType;
    insertion: string;
    position: 'start' | 'middle' | 'end';
    probability: number;
}
export type ModificationType = 'filler' | 'hedge' | 'thinking_aloud' | 'self_correction' | 'emphasis' | 'personal_aside' | 'relatable_moment';
export interface NaturalSpeechConfig {
    frequency: number;
    enabledPatterns: ModificationType[];
    personaStyle?: 'warm' | 'thoughtful' | 'energetic' | 'calm';
}
/**
 * Get a random speech modification based on context
 */
export declare function getSpeechModification(config: NaturalSpeechConfig, context: {
    isStartOfResponse?: boolean;
    isEmotionalTopic?: boolean;
    isComplexTopic?: boolean;
    needsEmphasis?: boolean;
}): SpeechModification | null;
/**
 * Add natural speech patterns to a response
 */
export declare function addNaturalSpeech(response: string, config: NaturalSpeechConfig, context?: {
    isEmotionalTopic?: boolean;
    isComplexTopic?: boolean;
    needsEmphasis?: boolean;
}): string;
/**
 * Generate a "thinking out loud" moment
 */
export declare function generateThinkingMoment(style?: string): string;
/**
 * Generate a self-correction
 */
export declare function generateSelfCorrection(style?: string): string;
/**
 * Format natural speech guidance for prompt
 */
export declare function formatNaturalSpeechGuidance(style?: string): string;
declare const _default: {
    getSpeechModification: typeof getSpeechModification;
    addNaturalSpeech: typeof addNaturalSpeech;
    generateThinkingMoment: typeof generateThinkingMoment;
    generateSelfCorrection: typeof generateSelfCorrection;
    formatNaturalSpeechGuidance: typeof formatNaturalSpeechGuidance;
};
export default _default;
//# sourceMappingURL=natural-speech.d.ts.map