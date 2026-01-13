/**
 * Voice Emotion → Entrance Enhancement
 *
 * Makes persona entrances respond to voice emotion signals.
 * When we detect stress/anxiety in their voice, we adjust the entrance
 * even if the text seems neutral.
 *
 * "Better than human" means hearing what they're NOT saying.
 *
 * @module personas/voice-emotion-entrances
 */
import type { EntranceContext, AliveEntranceResult } from './alive-entrances.js';
export interface VoiceEmotionEntranceContext {
    /** Primary voice emotion detected */
    voiceEmotion?: string;
    /** Voice emotion confidence (0-1) */
    voiceConfidence?: number;
    /** Arousal level from voice (0-1, 0=calm, 1=activated) */
    arousal?: number;
    /** Valence from voice (-1 to 1, negative=distressed) */
    valence?: number;
    /** Speech rate compared to baseline */
    speechRateDeviation?: number;
    /** Was there strain in the voice? */
    hasVoiceStrain?: boolean;
    /** Was there tremor in the voice? */
    hasVoiceTremor?: boolean;
}
export interface EntranceAdjustment {
    /** Should we override the mood detection? */
    overrideMood?: EntranceContext['userMood'];
    /** Entrance style preference */
    preferredStyle: 'calm' | 'gentle' | 'warm' | 'energetic' | 'standard';
    /** Additional context to include */
    voiceAwareness?: string;
    /** Tone modifiers */
    toneAdjustments: {
        softer: boolean;
        warmer: boolean;
        calmer: boolean;
        morePresent: boolean;
    };
    /** Reason for adjustment */
    reason: string;
}
/**
 * Get entrance adjustment based on voice emotion
 */
export declare function getVoiceEmotionEntranceAdjustment(voiceContext: VoiceEmotionEntranceContext): EntranceAdjustment;
/**
 * Apply voice emotion adjustment to entrance result
 */
export declare function applyVoiceAdjustmentToEntrance(entrance: AliveEntranceResult, adjustment: EntranceAdjustment): AliveEntranceResult;
/**
 * Determine if voice emotion should override text-based mood
 */
export declare function shouldVoiceOverrideMood(textMood: EntranceContext['userMood'], voiceContext: VoiceEmotionEntranceContext): boolean;
export declare const voiceEmotionEntrances: {
    getAdjustment: typeof getVoiceEmotionEntranceAdjustment;
    applyToEntrance: typeof applyVoiceAdjustmentToEntrance;
    shouldOverrideMood: typeof shouldVoiceOverrideMood;
};
export default voiceEmotionEntrances;
//# sourceMappingURL=voice-emotion-entrances.d.ts.map