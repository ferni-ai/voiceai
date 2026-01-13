/**
 * Intent Predictor
 *
 * Predicts user intent from partial transcript for faster responses.
 * Consolidated from response-anticipation/service.ts.
 *
 * @module speech/anticipation/intent-predictor
 */
import type { IntentPrediction } from './types.js';
/**
 * Intent predictor for partial transcripts
 */
export declare class IntentPredictor {
    private stats;
    /**
     * Predict intent from partial transcript
     */
    predict(text: string): IntentPrediction;
    /**
     * Calculate confidence score
     */
    private calculateConfidence;
    /**
     * Return unknown intent
     */
    private unknownIntent;
    /**
     * Get stats
     */
    getStats(): {
        intentCounts: {
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
//# sourceMappingURL=intent-predictor.d.ts.map