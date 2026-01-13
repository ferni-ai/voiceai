/**
 * Voice Emotion → Cognitive State Integration
 *
 * Maps detected voice emotions to cognitive state adjustments.
 * When we hear stress in someone's voice, we should shift to
 * a more empathetic cognitive mode, regardless of the persona's default.
 *
 * This creates emotionally intelligent voice AI that responds to
 * HOW something is said, not just WHAT is said.
 */
import type { ReasoningStyle, CognitiveContext } from '../../personas/cognitive-types.js';
export interface VoiceEmotionSignals {
    /** Primary detected emotion */
    emotion: string;
    /** Confidence in detection (0-1) */
    confidence: number;
    /** Speech rate (words per minute) */
    speechRate?: number;
    /** Pitch variance (normalized) */
    pitchVariance?: number;
    /** Volume level (normalized) */
    volume?: number;
    /** Detected tremor in voice */
    hasTremor?: boolean;
    /** Detected sighing */
    hasSighing?: boolean;
    /** Speaking faster than normal */
    isRushed?: boolean;
    /** Long pauses between words */
    hasHesitation?: boolean;
}
export interface CognitiveStateAdjustment {
    /** Suggested shift in reasoning style */
    suggestedStyle?: ReasoningStyle;
    /** Strength of suggestion (0-1) */
    suggestionStrength: number;
    /** Whether to prioritize empathy */
    prioritizeEmpathy: boolean;
    /** Whether to slow down pace */
    slowDown: boolean;
    /** Whether to add more pauses */
    addPauses: boolean;
    /** Whether to soften tone */
    softenTone: boolean;
    /** Whether to check understanding more */
    increaseComprehensionChecks: boolean;
    /** Emotional weight adjustment */
    emotionalWeightBoost: number;
    /** Reason for adjustment */
    reason: string;
}
/**
 * Process voice emotion signals and return cognitive adjustments
 */
export declare function processVoiceEmotion(signals: VoiceEmotionSignals): CognitiveStateAdjustment;
/**
 * Apply voice emotion adjustments to cognitive context
 */
export declare function applyVoiceEmotionToContext(context: CognitiveContext, signals: VoiceEmotionSignals): CognitiveContext;
/**
 * Should cognitive engine override its default style based on voice emotion?
 */
export declare function shouldOverrideStyle(defaultStyle: ReasoningStyle, adjustment: CognitiveStateAdjustment): boolean;
/**
 * Get combined cognitive style considering voice emotion
 */
export declare function getCombinedCognitiveStyle(personaDefaultStyle: ReasoningStyle, voiceAdjustment: CognitiveStateAdjustment): ReasoningStyle;
/**
 * Generate voice-aware response guidance
 */
export declare function generateVoiceAwareGuidance(signals: VoiceEmotionSignals): string[];
interface SessionVoiceEmotionState {
    recentEmotions: string[];
    emotionalTrend: 'improving' | 'worsening' | 'stable';
    averageStress: number;
    totalSamples: number;
}
/**
 * Track voice emotion over session
 */
export declare function trackSessionVoiceEmotion(sessionId: string, signals: VoiceEmotionSignals): SessionVoiceEmotionState;
/**
 * Get session voice emotion state
 */
export declare function getSessionVoiceState(sessionId: string): SessionVoiceEmotionState | null;
/**
 * Clear session voice state
 */
export declare function clearSessionVoiceState(sessionId: string): void;
declare const _default: {
    processVoiceEmotion: typeof processVoiceEmotion;
    applyVoiceEmotionToContext: typeof applyVoiceEmotionToContext;
    shouldOverrideStyle: typeof shouldOverrideStyle;
    getCombinedCognitiveStyle: typeof getCombinedCognitiveStyle;
    generateVoiceAwareGuidance: typeof generateVoiceAwareGuidance;
    trackSessionVoiceEmotion: typeof trackSessionVoiceEmotion;
    getSessionVoiceState: typeof getSessionVoiceState;
    clearSessionVoiceState: typeof clearSessionVoiceState;
};
export default _default;
//# sourceMappingURL=voice-emotion-cognitive.d.ts.map