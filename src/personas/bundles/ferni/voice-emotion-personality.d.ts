/**
 * Voice Emotion → Personality Integration
 *
 * "Better than human" means responding to HOW something is said, not just WHAT.
 *
 * This module maps voice emotion signals to personality expression adaptations:
 * - Stressed voice → warmer, gentler expressions
 * - Excited voice → match energy, enthusiasm
 * - Hesitant voice → more encouraging, patient expressions
 * - Sad voice → softer, more empathetic expressions
 *
 * @module personas/bundles/ferni/voice-emotion-personality
 */
import type { ThemeCategory } from '../../../services/session-variety-tracker.js';
export interface VoiceEmotionResult {
    primary?: string;
    arousal?: number;
    valence?: number;
    confidence?: number;
}
export interface VoicePersonalityAdjustment {
    /** Themes that match this voice state */
    preferredThemes: ThemeCategory[];
    /** Themes to avoid in this voice state */
    avoidThemes: ThemeCategory[];
    /** Expression tone modifier */
    toneModifier: 'warmer' | 'gentler' | 'energetic' | 'calmer' | 'encouraging' | 'neutral';
    /** Whether to prioritize acknowledgment over expression */
    prioritizeAcknowledgment: boolean;
    /** Whether expressions should be shorter */
    preferShorterExpressions: boolean;
    /** Intimacy level adjustment (-0.3 to +0.3) */
    intimacyAdjustment: number;
    /** Suggested injection point (ComposedExpression.timing compatible) */
    suggestedInjectionPoint: 'immediate' | 'after_pause' | 'mid_response' | 'at_end';
    /** Reason for this adjustment */
    reason: string;
}
export interface VoiceEmotionContext {
    /** Primary voice emotion detected */
    primary?: string;
    /** Arousal level (0-1, 0=calm, 1=activated) */
    arousal?: number;
    /** Valence (-1 to 1, negative=distressed, positive=happy) */
    valence?: number;
    /** Confidence in detection (0-1) */
    confidence?: number;
    /** Speech rate category */
    speechPace?: 'slow' | 'normal' | 'fast';
    /** Energy level */
    energyLevel?: 'low' | 'medium' | 'high';
    /** Voice quality signals */
    hasStrain?: boolean;
    hasTremor?: boolean;
    hasBreathiness?: boolean;
}
/**
 * Get personality adjustment based on voice emotion
 */
export declare function getVoiceEmotionAdjustment(voiceContext: VoiceEmotionContext): VoicePersonalityAdjustment;
/**
 * Check if a theme is preferred for current voice state
 */
export declare function isThemePreferredForVoice(theme: ThemeCategory, adjustment: VoicePersonalityAdjustment): boolean;
/**
 * Check if a theme should be avoided for current voice state
 */
export declare function shouldAvoidThemeForVoice(theme: ThemeCategory, adjustment: VoicePersonalityAdjustment): boolean;
/**
 * Convert VoiceEmotionResult to our internal context format
 */
export declare function fromVoiceEmotionResult(result?: VoiceEmotionResult): VoiceEmotionContext;
export declare const voiceEmotionPersonality: {
    getAdjustment: typeof getVoiceEmotionAdjustment;
    isThemePreferred: typeof isThemePreferredForVoice;
    shouldAvoidTheme: typeof shouldAvoidThemeForVoice;
    fromVoiceEmotionResult: typeof fromVoiceEmotionResult;
};
export default voiceEmotionPersonality;
//# sourceMappingURL=voice-emotion-personality.d.ts.map