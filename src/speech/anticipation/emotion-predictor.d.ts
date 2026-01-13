/**
 * Emotion Predictor
 *
 * Predicts emotional trajectory from partial transcript for responsive prosody.
 * Consolidated from sesame-inspired/anticipatory-prosody.ts.
 *
 * @module speech/anticipation/emotion-predictor
 */
import type { EmotionalPrediction } from './types.js';
/**
 * Emotional trajectory predictor for partial transcripts
 */
export declare class EmotionPredictor {
    private stats;
    /**
     * Predict emotional trajectory from partial transcript
     */
    predict(text: string, tone?: string): EmotionalPrediction;
    /**
     * Calculate confidence for a pattern match
     */
    private calculateConfidence;
    /**
     * Return neutral prediction
     */
    private neutralPrediction;
    /**
     * Get stats
     */
    getStats(): {
        trajectoryCounts: {
            [k: string]: number;
        };
        predictions: number;
        highConfidence: number;
    };
    /**
     * Reset stats
     */
    reset(): void;
}
//# sourceMappingURL=emotion-predictor.d.ts.map