/**
 * Turn Prediction Service
 *
 * Predicts when a user has finished their turn, enabling:
 * - Earlier response generation (reduced latency)
 * - Better handling of thinking pauses vs actual completion
 * - More natural conversation flow
 *
 * Uses multiple signals:
 * 1. Sentence completion heuristics (punctuation, completeness)
 * 2. Semantic completeness (is this a complete thought?)
 * 3. Prosodic cues (falling pitch, slowdown - when available)
 * 4. Turn-final phrases ("you know?", "so yeah")
 * 5. User's historical patterns
 *
 * @see docs/features/VOICE-PRESENCE-ROADMAP.md
 */
export interface TurnPredictionContext {
    /** Current partial transcript */
    transcript: string;
    /** Time since user started speaking (ms) */
    speakingDurationMs: number;
    /** Current silence duration (ms) */
    silenceDurationMs: number;
    /** User's average WPM from this session */
    userWPM?: number;
    /** Is there a rising or falling intonation? (from audio analysis) */
    intonation?: 'rising' | 'falling' | 'neutral';
    /** Current topic weight */
    topicWeight?: 'light' | 'medium' | 'heavy';
    /** User's emotion state */
    emotionIntensity?: number;
    /** Turn count in conversation */
    turnCount: number;
}
export interface TurnPrediction {
    /** Is this likely a complete turn? */
    isComplete: boolean;
    /** Confidence in the prediction (0-1) */
    confidence: number;
    /** Estimated remaining words (0 = done) */
    estimatedRemainingWords: number;
    /** Should we start generating a response? */
    readyToRespond: boolean;
    /** Reason for the prediction */
    reason: string;
    /** Suggested wait time before responding (ms) */
    suggestedWaitMs: number;
}
export interface SentenceCompletenessResult {
    /** Is the sentence grammatically complete? */
    isComplete: boolean;
    /** Confidence (0-1) */
    confidence: number;
    /** Type of ending detected */
    endingType: 'question' | 'statement' | 'exclamation' | 'trailing' | 'turn_final_phrase' | 'incomplete';
    /** Reason */
    reason: string;
}
/**
 * Analyze if a transcript represents a complete sentence/thought
 */
export declare function analyzeTranscriptCompleteness(transcript: string): SentenceCompletenessResult;
export declare class TurnPredictionService {
    private userTurnLengths;
    private userPauseLengths;
    private lastPrediction;
    /**
     * Predict if the user has finished their turn
     */
    predict(ctx: TurnPredictionContext): TurnPrediction;
    /**
     * Record actual turn completion for learning
     */
    recordTurnCompletion(wordCount: number, pauseBeforeResponseMs: number): void;
    /**
     * Get confidence boost from silence duration
     */
    private getSilenceConfidenceBoost;
    /**
     * Calculate how long to wait before responding
     */
    private calculateSuggestedWait;
    /**
     * Estimate remaining words in the turn
     */
    private estimateRemainingWords;
    /**
     * Get average of an array
     */
    private getAverageValue;
    /**
     * Get the last prediction
     */
    getLastPrediction(): TurnPrediction | null;
    /**
     * Reset service state
     */
    reset(): void;
}
export interface PreemptiveGenerationDecision {
    /** Should we start generating? */
    shouldGenerate: boolean;
    /** What confidence threshold triggered this? */
    triggerConfidence: number;
    /** How much to prepare (full response vs. opening) */
    preparationLevel: 'opening_only' | 'partial' | 'full';
    /** Reason */
    reason: string;
}
/**
 * Decide if we should start generating a response preemptively
 */
export declare function decidePreemptiveGeneration(prediction: TurnPrediction, currentLatencyMs: number): PreemptiveGenerationDecision;
export declare function getTurnPredictionService(sessionId: string): TurnPredictionService;
export declare function resetTurnPredictionService(sessionId: string): void;
export declare function resetAllTurnPrediction(): void;
export declare function getActiveTurnPredictionCount(): number;
//# sourceMappingURL=turn-prediction.d.ts.map