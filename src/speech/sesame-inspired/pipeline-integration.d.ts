/**
 * Sesame-Inspired Pipeline Integration
 *
 * Optimizes the emotion detection → SSML pipeline by:
 * 1. Processing anticipatory signals during partial transcripts (not after)
 * 2. Pre-computing prosody adjustments before TTS
 * 3. Caching micro-reaction decisions to reduce response latency
 * 4. Integrating all Sesame features into a single, fast call path
 *
 * @module speech/sesame-inspired/pipeline-integration
 */
import type { CartesiaEmotion } from '../cartesia-expressiveness.js';
import type { PartialTranscript } from './types.js';
/**
 * Pre-computed response preparation from partial transcript
 */
export interface PreparedResponse {
    /** Anticipated emotion from partial transcript */
    anticipatedEmotion: CartesiaEmotion | null;
    /** Opening micro-reaction SSML */
    microReactionSsml: string | null;
    /** Speed adjustment */
    speedMultiplier: number;
    /** Volume adjustment */
    volumeMultiplier: number;
    /** Pause multiplier for context */
    pauseMultiplier: number;
    /** Should use softer delivery? */
    softerDelivery: boolean;
    /** Confidence in anticipation (0-1) */
    confidence: number;
    /** Reason for adjustments */
    reason: string;
    /** Timestamp of preparation */
    preparedAt: number;
}
/**
 * Enhanced text result with all Sesame features applied
 */
export interface SesameEnhancedResult {
    /** Original text */
    original: string;
    /** Enhanced text with SSML */
    enhanced: string;
    /** Features applied */
    features: string[];
    /** Processing time in ms */
    processingMs: number;
}
/**
 * Process partial transcript to prepare response prosody in advance
 *
 * CALL THIS DURING USER SPEECH, NOT AFTER!
 * This is what makes Sesame-style anticipatory response possible.
 *
 * @param sessionId - Session ID
 * @param partial - Partial transcript from STT
 * @returns Prepared response parameters
 */
export declare function processPartialTranscript(sessionId: string, partial: PartialTranscript): PreparedResponse | null;
/**
 * Get the last prepared response (use when generating TTS)
 */
export declare function getPreparedResponse(sessionId: string): PreparedResponse | null;
/**
 * Enhance response text with all Sesame-inspired features
 *
 * Call this BEFORE sending to TTS. It uses pre-computed anticipatory
 * data when available for faster processing.
 *
 * @param sessionId - Session ID
 * @param text - Response text from LLM
 * @param detectedEmotion - Detected emotion (from content or voice)
 * @param turnNumber - Current turn number
 * @returns Enhanced text with SSML
 */
export declare function enhanceResponseWithSesame(sessionId: string, text: string, detectedEmotion: CartesiaEmotion, turnNumber: number): SesameEnhancedResult;
/**
 * Quick enhancement for simple cases (lower latency)
 *
 * Use this when you don't need full disfluency injection
 */
export declare function quickEnhance(sessionId: string, text: string, emotion: CartesiaEmotion): string;
/**
 * Mark start of new turn (reset anticipation)
 */
export declare function startNewTurn(sessionId: string): void;
/**
 * Reset session state
 */
export declare function resetSesamePipeline(sessionId: string): void;
/**
 * Get active session count
 */
export declare function getActiveSesamePipelineSessionCount(): number;
/**
 * Get latency metrics for the pipeline
 */
export declare function getSesamePipelineMetrics(sessionId: string): {
    hasAnticipation: boolean;
    anticipationAge: number | null;
    turnCount: number;
};
//# sourceMappingURL=pipeline-integration.d.ts.map