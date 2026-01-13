/**
 * Voice Emotion to Effect Mapping
 *
 * Maps detected voice emotions to appropriate humanization effects.
 * Enables the AI to respond to HOW the user is speaking, not just what they say.
 *
 * @module @ferni/conversation/effects/voice-emotion-mapping
 */
import type { HumanizationCapability } from './types.js';
export type VoiceEmotion = 'neutral' | 'happy' | 'excited' | 'sad' | 'angry' | 'fearful' | 'anxious' | 'frustrated' | 'confident' | 'hesitant' | 'tired' | 'stressed' | 'relieved' | 'curious' | 'surprised';
export interface VoiceEmotionSignal {
    emotion: VoiceEmotion;
    confidence: number;
    /** Voice quality indicators */
    voiceQuality?: {
        tremor: boolean;
        breathiness: number;
        pitch: 'high' | 'normal' | 'low';
        pace: 'fast' | 'normal' | 'slow';
        volume: 'loud' | 'normal' | 'quiet';
    };
}
export interface EffectRecommendation {
    /** Effect ID to boost */
    effectId: string;
    /** Probability multiplier (>1 = boost, <1 = reduce) */
    probabilityMultiplier: number;
    /** Reason for recommendation */
    reason: string;
}
export interface EmotionEffectMapping {
    /** Capabilities to prioritize */
    priorityCapabilities: HumanizationCapability[];
    /** Specific effect recommendations */
    recommendations: EffectRecommendation[];
    /** Overall humanization intensity adjustment */
    intensityModifier: number;
    /** Should we slow down our response? */
    shouldSlowDown: boolean;
    /** Should we be more gentle? */
    shouldSoften: boolean;
}
/**
 * Get effect recommendations based on detected voice emotion
 */
export declare function getEffectMappingForEmotion(emotion: VoiceEmotion): EmotionEffectMapping;
/**
 * Get effect probability modifier for a specific effect based on voice emotion
 */
export declare function getEffectModifierForEmotion(effectId: string, emotion: VoiceEmotion): number;
/**
 * Process voice emotion signal and return effect configuration
 */
export declare function processVoiceEmotionForEffects(signal: VoiceEmotionSignal): {
    mapping: EmotionEffectMapping;
    /** Additional adjustments based on voice quality */
    voiceQualityAdjustments: Record<string, number>;
};
export declare const voiceEmotionEffects: {
    getMapping: typeof getEffectMappingForEmotion;
    getModifier: typeof getEffectModifierForEmotion;
    process: typeof processVoiceEmotionForEffects;
};
//# sourceMappingURL=voice-emotion-mapping.d.ts.map