/**
 * Voice Emotion Intelligence
 *
 * Translates voice prosody analysis into actionable LLM guidance.
 * When someone's voice tells a different story than their words,
 * the AI should notice and respond to the REAL emotion.
 *
 * This is what separates a good AI from a great one:
 * "I hear you saying you're fine, but something in your voice..."
 */
import type { VoiceEmotionResult } from '../../../speech/audio-prosody.js';
import type { EmotionResult } from '../../emotion-detector.js';
export interface VoiceEmotionIntelligence {
    /** Should the AI address the voice-text mismatch? */
    shouldAddressDiscrepancy: boolean;
    /** The guidance to inject into the LLM context */
    guidance: string;
    /** @deprecated Use doBehaviors instead - behavioral guidance, not literal phrases */
    suggestedPhrases: string[];
    /** Behavioral DO patterns - what to express, not literal phrases */
    doBehaviors: string[];
    /** What the AI should NOT do */
    avoidBehaviors: string[];
    /** Voice-specific adjustments for response delivery */
    deliveryAdjustments: {
        speed: 'slower' | 'normal' | 'faster';
        volume: 'softer' | 'normal' | 'louder';
        warmth: 'high' | 'medium' | 'low';
        pauseFrequency: 'more' | 'normal' | 'less';
    };
    /** Confidence in this analysis */
    confidence: number;
    /** Debug info */
    analysis: {
        voiceSaysStressed: boolean;
        voiceSaysExcited: boolean;
        voiceSaysSad: boolean;
        voiceSaysAngry: boolean;
        textSaysOpposite: boolean;
        mismatchType?: string;
    };
}
/**
 * Analyze voice emotion against text emotion and generate intelligent guidance
 */
export declare function analyzeVoiceEmotionIntelligence(voiceEmotion: VoiceEmotionResult | null, textEmotion: EmotionResult | null, _turnCount?: number): VoiceEmotionIntelligence;
/**
 * Format voice intelligence for prompt injection
 *
 * NOTE: We no longer inject static "CONSIDER PHRASES LIKE" because:
 * 1. Static phrases don't fit all personas (Joel shouldn't say "spill it!")
 * 2. The guidance section already tells the LLM HOW to behave
 * 3. LLM should generate persona-appropriate phrasing based on behavioral guidance
 */
export declare function formatVoiceIntelligenceForPrompt(intelligence: VoiceEmotionIntelligence): string;
export default analyzeVoiceEmotionIntelligence;
//# sourceMappingURL=voice-emotion-intelligence.d.ts.map