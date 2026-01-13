/**
 * Predictive Intelligence Integration
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Bridges THREE pattern detection systems to create truly superhuman predictions:
 *
 * 1. **coaching-patterns.ts** - Linguistic patterns ("You say 'should' a lot")
 * 2. **predictive-coaching.ts** - Temporal predictions ("Mondays stress you out")
 * 3. **superhuman-observations.ts** - Deep insights ("You deflect with humor")
 *
 * This integration:
 * - Wires all three systems into the conversation flow
 * - Records observations from each turn (via async events for scale)
 * - Generates proactive predictions
 * - Surfaces insights at the right moment
 *
 * SCALING:
 * - Set `useAsyncEvents: true` to emit events for background worker processing
 * - This reduces latency in the turn processor
 * - Events are processed by PredictionsWorker in batches
 *
 * @module agents/integrations/predictive-intelligence-integration
 */
export interface TurnObservation {
    userId: string;
    sessionId: string;
    message: string;
    topic: string;
    emotion?: string;
    emotionIntensity?: number;
    voiceStrain?: number;
    dayOfWeek: number;
    hourOfDay: number;
    turnCount: number;
    sessionCount: number;
    relationshipStage?: string;
}
export interface PredictiveIntelligenceResult {
    /** Pattern observations recorded */
    patternsRecorded: number;
    /** Whether a superhuman observation was detected */
    superhumanObservationDetected: boolean;
    /** Content to potentially surface (from observations engine) */
    surfacingContent?: {
        phrase: string;
        timing: 'now' | 'after_response' | 'next_relevant_moment';
    };
}
export interface PredictiveIntelligenceConfig {
    /**
     * Use async events for scaled processing.
     * When true, observations are emitted as events for background worker processing.
     * When false, observations are recorded directly (suitable for single-instance).
     * @default false
     */
    useAsyncEvents: boolean;
}
/**
 * Configure predictive intelligence behavior
 */
export declare function configurePredictiveIntelligence(newConfig: Partial<PredictiveIntelligenceConfig>): void;
/**
 * Initialize predictive intelligence for a session
 */
export declare function initializePredictiveIntelligence(sessionId: string, userId: string, existingObservations?: unknown[], sessionData?: {
    daysSinceLastConversation?: number;
}): void;
/**
 * Cleanup predictive intelligence for a session
 */
export declare function cleanupPredictiveIntelligence(sessionId: string, userId?: string, sessionSummary?: {
    topicsDiscussed?: string[];
    primaryEmotion?: string;
    satisfactionLevel?: number;
}): void;
/**
 * Process a turn for predictive intelligence
 *
 * This is the main entry point - call this after each user turn to:
 * 1. Record observations for predictive coaching
 * 2. Analyze message for superhuman observations
 * 3. Check if any insights should be surfaced
 *
 * This is fire-and-forget (doesn't block the turn processing).
 */
export declare function processForPredictiveIntelligence(observation: TurnObservation): Promise<PredictiveIntelligenceResult>;
/**
 * Get predictive context for injection into LLM
 *
 * Call this during context building to get predictions and observations
 * that should guide the agent's response.
 */
export declare function getPredictiveContextForTurn(userId: string, sessionId: string): Promise<string>;
export declare const predictiveIntelligence: {
    initialize: typeof initializePredictiveIntelligence;
    cleanup: typeof cleanupPredictiveIntelligence;
    processTurn: typeof processForPredictiveIntelligence;
    getContext: typeof getPredictiveContextForTurn;
};
export default predictiveIntelligence;
//# sourceMappingURL=predictive-intelligence-integration.d.ts.map