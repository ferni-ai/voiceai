/**
 * Concern Detection Engine
 *
 * Main engine that orchestrates concern detection across all signal sources.
 * This is a SUPERHUMAN capability: detecting distress signals that humans would miss.
 *
 * @module @ferni/conversation/concern-detection/engine
 */
import type { AnalysisContext, ConcernState, UserBaseline } from './types.js';
export declare class ConcernDetectionEngine {
    private signals;
    private previousScore;
    private turnCount;
    private engagementHistory;
    private responseLengthHistory;
    private lastProsodySignals;
    private lastBreathingSignals;
    private userBaseline;
    constructor();
    /**
     * Process a user message and detect concern signals
     */
    analyze(userMessage: string, context: AnalysisContext): ConcernState;
    /**
     * Get current concern state without new analysis
     */
    getCurrentState(): ConcernState;
    /**
     * Update user baseline (learned preferences)
     */
    updateBaseline(metrics: Partial<UserBaseline>): void;
    /**
     * Record positive outcome (concern was addressed successfully)
     */
    recordPositiveOutcome(): void;
    /**
     * Reset for new session
     */
    reset(): void;
    private computeState;
    private determineApproach;
    private addSignal;
    private logDetection;
}
export default ConcernDetectionEngine;
//# sourceMappingURL=engine.d.ts.map