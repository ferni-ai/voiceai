/**
 * Unified Anticipation Pipeline
 *
 * Combines intent prediction and emotional prosody anticipation into a single,
 * coherent system for preparing agent responses during user speech.
 *
 * Benefits:
 * - Single API for all anticipation
 * - Combines intent + emotion for richer understanding
 * - Coordinates micro-reactions with intent context
 * - Session-scoped with proper cleanup
 *
 * @module speech/anticipation/pipeline
 */
import type { AnticipationContext, AnticipationOptions, AnticipationResult } from './types.js';
/**
 * Unified anticipation pipeline
 *
 * Call during user speech to prepare response prosody before they finish.
 * This is what makes the agent feel present and responsive.
 */
export declare class AnticipationPipeline {
    private readonly sessionId;
    private readonly intentPredictor;
    private readonly emotionPredictor;
    private readonly options;
    private lastResult;
    private lastUpdateTime;
    private updateThrottleMs;
    constructor(sessionId: string, options?: AnticipationOptions);
    /**
     * Process partial transcript and return anticipation result
     *
     * Call this repeatedly during user speech. It's throttled internally
     * to avoid over-processing.
     */
    process(context: AnticipationContext): AnticipationResult | null;
    /**
     * Get the latest result without re-processing
     */
    getLatest(): AnticipationResult | null;
    /**
     * Get prepared prosody for response (convenience method)
     *
     * Returns null if no actionable anticipation is available.
     */
    getPreparedProsody(): AnticipationResult['prosody'] | null;
    /**
     * Check if we should use a micro-reaction
     */
    shouldUseMicroReaction(): boolean;
    /**
     * Get context hint for LLM (if available)
     */
    getContextHint(): string | null;
    private getActionableReason;
    /**
     * Get statistics
     */
    getStats(): {
        intentStats: {
            intentCounts: {
                [k: string]: number;
            };
            predictions: number;
            highConfidence: number;
        };
        emotionStats: {
            trajectoryCounts: {
                [k: string]: number;
            };
            predictions: number;
            highConfidence: number;
        };
        lastResultAge: number | null;
    };
    /**
     * Reset pipeline state
     */
    reset(): void;
}
/**
 * Get or create anticipation pipeline for a session
 */
export declare function getAnticipationPipeline(sessionId: string, options?: AnticipationOptions): AnticipationPipeline;
/**
 * Reset pipeline for a session
 */
export declare function resetAnticipationPipeline(sessionId: string): void;
/**
 * Reset all pipelines
 */
export declare function resetAllAnticipationPipelines(): void;
/**
 * Get active pipeline count
 */
export declare function getActiveAnticipationPipelineCount(): number;
//# sourceMappingURL=pipeline.d.ts.map