/**
 * Enhanced Turn Prediction with Prosodic Phrase Boundaries
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Goes beyond basic silence detection to predict turn completion using:
 * 1. **Intonational Phrase Boundaries (IPBs)**: Falling pitch indicates statement end
 * 2. **Boundary Tone Analysis**: Final rising = question/continue, falling = complete
 * 3. **Pre-boundary Lengthening**: Words before boundaries are typically lengthened
 * 4. **Pause-Internal Cues**: Not all pauses are turn-final
 *
 * Research basis:
 * - Gravano & Hirschberg (2011): Turn-yielding cues in dialogue
 * - Heldner & Edlund (2010): Pauses, gaps and overlaps
 *
 * @module EnhancedTurnPrediction
 */
import type { ProsodyFeatures } from './audio-prosody.js';
/**
 * Intonational phrase boundary detection result
 */
export interface PhraseBoundaryResult {
    /** Is this likely an intonational phrase boundary? */
    isPhraseBoundary: boolean;
    /** Boundary type */
    boundaryType: 'continuation' | 'question' | 'statement' | 'emphasis' | 'none';
    /** Confidence (0-1) */
    confidence: number;
    /** Pitch contour at boundary */
    boundaryContour: 'rising' | 'falling' | 'level' | 'complex';
    /** Pre-boundary lengthening detected */
    hasPreBoundaryLengthening: boolean;
}
/**
 * Turn completion prediction with prosodic evidence
 */
export interface TurnPredictionResult {
    /** Probability that turn is complete (0-1) */
    completionProbability: number;
    /** Recommended action */
    recommendation: 'wait' | 'take_turn' | 'backchannel' | 'uncertain';
    /** Evidence supporting the prediction */
    evidence: {
        /** Phrase boundary analysis */
        phraseBoundary: PhraseBoundaryResult;
        /** Syntactic completeness estimate (from text) */
        syntacticComplete: boolean;
        /** Silence duration (ms) */
        silenceDuration: number;
        /** User's typical turn duration (ms) */
        typicalTurnDuration: number;
        /** Current turn duration (ms) */
        currentTurnDuration: number;
        /** Turn duration ratio (current / typical) */
        turnDurationRatio: number;
    };
    /** Explanation for debugging */
    reason: string;
}
/**
 * Detect intonational phrase boundary from prosodic features
 */
export declare function detectPhraseBoundary(prosody: ProsodyFeatures, previousProsody?: ProsodyFeatures): PhraseBoundaryResult;
/**
 * Estimate if utterance is syntactically complete
 * This is a heuristic - not a full parser
 */
export declare function estimateSyntacticCompleteness(text: string): {
    isComplete: boolean;
    confidence: number;
    reason: string;
};
export declare class EnhancedTurnPredictionService {
    private sessionId;
    private turnHistory;
    private currentTurnStart;
    private lastProsody;
    private userTypicalTurnDuration;
    constructor(sessionId: string);
    /**
     * Predict if user has completed their turn
     */
    predict(prosody: ProsodyFeatures, transcriptSoFar: string, silenceDuration: number): TurnPredictionResult;
    /**
     * Record completed turn for learning
     */
    recordTurnComplete(duration: number, hadFinalFall: boolean, wasQuestion: boolean, silenceBeforeNext: number): void;
    /**
     * Get user's turn-taking patterns
     */
    getPatterns(): {
        typicalTurnDuration: number;
        typicalSilence: number;
        questionRatio: number;
        fallingEndRatio: number;
    };
    /**
     * Reset service state
     */
    reset(): void;
}
export declare function getEnhancedTurnPredictor(sessionId: string): EnhancedTurnPredictionService;
export declare function resetEnhancedTurnPredictor(sessionId: string): void;
export declare function getActiveEnhancedTurnPredictorCount(): number;
//# sourceMappingURL=enhanced-turn-prediction.d.ts.map