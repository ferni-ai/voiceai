/**
 * Prosody-to-Turn-Prediction Bridge
 *
 * Connects voice prosody analysis with turn prediction to enable
 * more accurate end-of-turn detection using actual voice intonation.
 *
 * When a user's pitch rises at the end of a sentence, they might be asking
 * a question or continuing. When it falls, they're likely done speaking.
 * Real humans pick up on this - now Ferni can too.
 */
import type { ProsodyFeatures, VoiceEmotionResult } from './audio-prosody.js';
import { type TurnPredictionContext, type TurnPrediction } from '../conversation/turn-prediction.js';
export type Intonation = 'rising' | 'falling' | 'neutral';
export interface EnhancedTurnPrediction extends TurnPrediction {
    /** Voice-based signals used in prediction */
    voiceSignals: {
        intonation: Intonation;
        stressLevel: number;
        speechRate: number;
        confidenceFromVoice: number;
    };
}
/**
 * Map prosody pitch contour to turn prediction intonation
 */
export declare function mapPitchContourToIntonation(pitchContour: ProsodyFeatures['pitchContour']): Intonation;
/**
 * Extract intonation from voice emotion result
 */
export declare function getIntonationFromVoiceEmotion(voiceEmotion: VoiceEmotionResult | null): Intonation;
/**
 * Create turn prediction context with voice prosody signals
 */
export declare function createTurnPredictionContext(transcript: string, options: {
    voiceEmotion?: VoiceEmotionResult | null;
    speakingDurationMs?: number;
    silenceDurationMs?: number;
    turnCount?: number;
    topicWeight?: 'light' | 'medium' | 'heavy';
}): TurnPredictionContext;
/**
 * Get enhanced turn prediction with voice signals
 */
export declare function predictTurnWithVoice(sessionId: string, transcript: string, voiceEmotion: VoiceEmotionResult | null, options?: {
    speakingDurationMs?: number;
    silenceDurationMs?: number;
    turnCount?: number;
    topicWeight?: 'light' | 'medium' | 'heavy';
}): EnhancedTurnPrediction;
/**
 * Check if voice prosody strongly suggests turn completion
 * This can be used for faster response initiation
 */
export declare function voiceSuggestsTurnComplete(voiceEmotion: VoiceEmotionResult | null): {
    suggests: boolean;
    confidence: number;
    reason: string;
};
declare const _default: {
    mapPitchContourToIntonation: typeof mapPitchContourToIntonation;
    getIntonationFromVoiceEmotion: typeof getIntonationFromVoiceEmotion;
    createTurnPredictionContext: typeof createTurnPredictionContext;
    predictTurnWithVoice: typeof predictTurnWithVoice;
    voiceSuggestsTurnComplete: typeof voiceSuggestsTurnComplete;
};
export default _default;
//# sourceMappingURL=prosody-turn-bridge.d.ts.map