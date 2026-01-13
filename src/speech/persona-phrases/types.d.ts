/**
 * Persona Phrases - Type Definitions
 *
 * All types for persona-specific phrases.
 *
 * @module persona-phrases/types
 */
export type PersonaId = 'ferni' | 'jack-b' | 'nayan-patel' | 'peter-john' | 'maya-santos' | 'maya' | 'jordan-taylor' | 'jordan' | 'alex-chen' | 'alex';
export type BackchannelEmotionType = 'neutral' | 'engaged' | 'empathetic' | 'excited' | 'supportive';
export type BackchannelCategory = 'acknowledgment' | 'understanding' | 'encouragement' | 'empathy' | 'agreement' | 'surprise' | 'thinking';
export type AcknowledgmentMood = 'neutral' | 'engaged' | 'empathetic' | 'excited' | 'thoughtful';
export interface PersonaBackchannelStyle {
    /** Preferred backchannel categories for this persona */
    preferred: BackchannelCategory[];
    /** Volume ratio for backchannels (0-1) */
    volumeRatio: number;
    /** Cartesia emotion tag to use */
    emotionTag?: string;
    /** Speed variation range (e.g., 0.1 = ±10%) for natural feel */
    speedVariation?: number;
}
export interface CatchphraseConfig {
    phrases: string[];
    emphasis: 'slow' | 'normal' | 'excited';
    ssmlWrapper: (phrase: string) => string;
}
//# sourceMappingURL=types.d.ts.map