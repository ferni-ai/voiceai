/**
 * VoiceAnalyzer Interface (Port)
 *
 * Defines the contract for voice-based personality intelligence.
 * SUPERHUMAN: Extract emotional signals from voice that humans miss.
 *
 * @module personality/domain/interfaces/voice-analyzer
 */
import type { PrimaryEmotion, GranularEmotion, EmotionSource } from '../model/value-objects/emotional-state.js';
/**
 * Voice tone classification
 */
export type VoiceTone = 'rising' | 'falling' | 'flat' | 'breaking' | 'warm' | 'cold' | 'neutral';
/**
 * Voice pace classification
 */
export type VoicePace = 'rapid' | 'fast' | 'normal' | 'slow' | 'hesitant';
/**
 * Breath pattern classification
 */
export type BreathPattern = 'normal' | 'shallow' | 'deep' | 'sighing' | 'held' | 'irregular';
/**
 * Silence type classification
 */
export type SilenceType = 'processing' | 'emotional' | 'uncomfortable' | 'invitational' | 'exhausted' | 'contemplative';
/**
 * Raw voice features for analysis
 */
export interface VoiceFeatures {
    /** Average pitch (Hz) */
    pitchMean?: number;
    /** Pitch variation (Hz) */
    pitchVariation?: number;
    /** Speaking rate (words per minute) */
    speakingRate?: number;
    /** Energy level (dB) */
    energyLevel?: number;
    /** Jitter (pitch instability) */
    jitter?: number;
    /** Shimmer (amplitude instability) */
    shimmer?: number;
    /** Voice quality score (0-1) */
    voiceQuality?: number;
    /** Duration of speech (ms) */
    speechDuration?: number;
    /** Duration of pauses (ms) */
    pauseDuration?: number;
    /** Number of pauses */
    pauseCount?: number;
}
/**
 * Result of voice emotion analysis
 */
export interface VoiceEmotionResult {
    /** Detected primary emotion */
    emotion: PrimaryEmotion;
    /** Granular emotion if confident */
    granular: GranularEmotion | null;
    /** Confidence (0-1) */
    confidence: number;
    /** Voice tone */
    tone: VoiceTone;
    /** Voice pace */
    pace: VoicePace;
    /** Source marker */
    source: EmotionSource;
}
/**
 * Result of stress analysis
 */
export interface StressAnalysisResult {
    /** Stress level (0-1) */
    stressLevel: number;
    /** Indicators that contributed */
    indicators: string[];
    /** Trend from recent history */
    trend: 'increasing' | 'stable' | 'decreasing';
    /** Confidence in assessment */
    confidence: number;
}
/**
 * Result of silence analysis
 */
export interface SilenceAnalysisResult {
    /** Type of silence */
    type: SilenceType;
    /** Confidence (0-1) */
    confidence: number;
    /** Recommended response */
    recommendedResponse: 'hold_space' | 'gentle_prompt' | 'wait' | 'check_in';
    /** Suggested phrase if any */
    suggestedPhrase?: string;
}
/**
 * Result of breath analysis
 */
export interface BreathAnalysisResult {
    /** Detected pattern */
    pattern: BreathPattern;
    /** User's breath rate (breaths per minute, estimated) */
    estimatedRate?: number;
    /** Should we sync our "breathing" to theirs? */
    shouldSync: boolean;
    /** Emotional indicator from breath */
    emotionalIndicator?: string;
}
/**
 * VoiceAnalyzer Interface
 *
 * This port defines what voice analysis capabilities the domain needs.
 * Infrastructure provides the implementation (e.g., from audio processing).
 */
export interface VoiceAnalyzer {
    /**
     * Analyze voice for emotional content
     *
     * SUPERHUMAN: Detect emotions humans miss in voice
     */
    analyzeEmotion(features: VoiceFeatures): Promise<VoiceEmotionResult>;
    /**
     * Analyze voice for stress indicators
     *
     * SUPERHUMAN: Detect stress before it's verbalized
     */
    analyzeStress(features: VoiceFeatures): Promise<StressAnalysisResult>;
    /**
     * Classify a silence
     *
     * SUPERHUMAN: Know what silence means
     */
    classifySilence(durationMs: number, context: {
        precedingEmotion?: PrimaryEmotion;
        conversationPhase?: 'opening' | 'middle' | 'deep' | 'closing';
        voiceFeaturesBefore?: VoiceFeatures;
    }): Promise<SilenceAnalysisResult>;
    /**
     * Analyze breath patterns
     *
     * SUPERHUMAN: Neural mirroring through breath
     */
    analyzeBreath(features: VoiceFeatures): Promise<BreathAnalysisResult>;
    /**
     * Detect if voice is breaking (emotional overwhelm)
     *
     * SUPERHUMAN: Catch vulnerability signals
     */
    detectVoiceBreaking(features: VoiceFeatures): Promise<{
        isBreaking: boolean;
        confidence: number;
        severity: 'mild' | 'moderate' | 'severe';
    }>;
    /**
     * Get voice tone classification
     */
    classifyTone(features: VoiceFeatures): Promise<VoiceTone>;
    /**
     * Compare current voice to user's baseline
     *
     * SUPERHUMAN: Track changes from their normal
     */
    compareToBaseline(currentFeatures: VoiceFeatures, baselineFeatures: VoiceFeatures): Promise<{
        deviations: string[];
        significantChange: boolean;
        suggestedInterpretation?: string;
    }>;
}
/**
 * Type helper for voice analyzer implementations
 */
export type VoiceAnalyzerImpl = VoiceAnalyzer;
//# sourceMappingURL=voice-analyzer.d.ts.map