/**
 * Voice Emotion Orchestrator
 *
 * Consolidates all voice emotion analysis into a single, coherent system.
 * Previously, voice emotion was processed in multiple places:
 * - emotional.ts (voice+text merge)
 * - voice-emotion.ts (cognitive adjustment)
 * - advanced-voice-emotion.ts (Hume AI)
 * - voice-emotion-intelligence.ts (enhanced)
 *
 * This orchestrator provides:
 * - Single source of truth for voice emotion state
 * - Unified API for voice emotion analysis
 * - Integration with session state manager
 * - Consistent guidance generation
 *
 * @module intelligence/voice-emotion-orchestrator
 */
import { type DistressLevel } from '../detectors/distress.js';
/**
 * Raw voice emotion input from audio analysis
 */
export interface VoiceEmotionInput {
    /** Primary emotion detected */
    emotion: string;
    /** Confidence in detection (0-1) */
    confidence: number;
    /** Speech rate (words per minute) */
    speechRate?: number;
    /** Pitch variance (normalized) */
    pitch?: number;
    /** Stress level from prosody (0-1) */
    stressLevel?: number;
    /** Arousal level (0-1) */
    arousal?: number;
    /** Valence (-1 to 1) */
    valence?: number;
    /** Optional direct anxiety marker signal (from upstream detector) */
    anxietyMarkers?: boolean;
}
/**
 * Text emotion input
 */
export interface TextEmotionInput {
    /** Primary emotion */
    primary: string;
    /** Emotion intensity (0-1) */
    intensity: number;
    /** Distress level (0-1) */
    distressLevel: number;
    /** Valence */
    valence: 'positive' | 'negative' | 'neutral';
}
/**
 * Unified voice emotion analysis result
 */
export interface VoiceEmotionAnalysis {
    /** Primary emotion (merged from voice + text) */
    primary: string;
    /** Source of primary emotion */
    source: 'voice' | 'text' | 'merged';
    /** Overall confidence */
    confidence: number;
    /** Merged distress level */
    distressLevel: number;
    /** Distress category */
    distressCategory: DistressLevel;
    /** Stress indicators */
    stressIndicators: {
        voiceStress: number;
        textDistress: number;
        hasTremor: boolean;
        isRushed: boolean;
        hasHesitation: boolean;
        anxietyMarkers: boolean;
    };
    /** Emotional trend in session */
    trend: 'improving' | 'stable' | 'declining';
    /** Voice quality signals */
    voiceQuality: {
        speechRate?: number;
        pitch?: number;
        arousal?: number;
        valence?: number;
    };
    /** Guidance for response */
    guidance: VoiceEmotionGuidance;
}
/**
 * Guidance based on voice emotion
 */
export interface VoiceEmotionGuidance {
    /** Should slow down speech */
    slowDown: boolean;
    /** Should add pauses */
    addPauses: boolean;
    /** Should soften tone */
    softenTone: boolean;
    /** Should check comprehension */
    checkComprehension: boolean;
    /** Suggested cognitive style */
    suggestedStyle?: 'supportive' | 'calm' | 'energetic' | 'gentle';
    /** Specific guidance messages */
    messages: string[];
}
/**
 * Suppression detection result
 */
export interface SuppressionResult {
    /** Is user suppressing emotions */
    isSuppressing: boolean;
    /** What they're displaying */
    displayed?: string;
    /** What they might be suppressing */
    suppressed?: string;
    /** Confidence in detection */
    confidence: number;
}
declare class VoiceEmotionOrchestratorImpl {
    /**
     * Analyze voice emotion and merge with text emotion
     *
     * This is the main entry point for voice emotion analysis.
     * It combines voice prosody signals with text-based emotion detection.
     */
    analyze(sessionId: string, voiceInput: VoiceEmotionInput | undefined, textInput: TextEmotionInput, userText: string): VoiceEmotionAnalysis;
    /**
     * Detect stress indicators from voice and text
     */
    private detectStressIndicators;
    /**
     * Detect tremor from pitch variance
     */
    private detectTremor;
    /**
     * Detect rushed speech
     */
    private detectRushed;
    /**
     * Detect hesitation patterns
     */
    private detectHesitation;
    /**
     * Detect anxiety markers
     */
    private detectAnxietyMarkers;
    /**
     * Merge distress levels from voice and text
     */
    private mergeDistress;
    /**
     * Determine primary emotion from voice and text
     */
    private determinePrimaryEmotion;
    /**
     * Map voice emotion labels to text emotion labels
     */
    private mapVoiceEmotion;
    /**
     * Generate response guidance based on voice emotion
     */
    private generateGuidance;
    /**
     * Detect if user is suppressing emotions
     */
    detectSuppression(voice: VoiceEmotionInput | undefined, text: TextEmotionInput): SuppressionResult;
    /**
     * Format voice emotion analysis for prompt injection
     */
    formatForPrompt(analysis: VoiceEmotionAnalysis): string;
    /**
     * Clear session data
     */
    clearSession(sessionId: string): void;
}
export declare const VoiceEmotionOrchestrator: VoiceEmotionOrchestratorImpl;
/**
 * Analyze voice emotion (shorthand)
 */
export declare function analyzeVoiceEmotion(sessionId: string, voice: VoiceEmotionInput | undefined, text: TextEmotionInput, userText: string): VoiceEmotionAnalysis;
/**
 * Detect emotion suppression
 */
export declare function detectEmotionSuppression(voice: VoiceEmotionInput | undefined, text: TextEmotionInput): SuppressionResult;
/**
 * Format voice emotion for prompt
 */
export declare function formatVoiceEmotionForPrompt(analysis: VoiceEmotionAnalysis): string;
export default VoiceEmotionOrchestrator;
//# sourceMappingURL=voice-emotion-orchestrator.d.ts.map