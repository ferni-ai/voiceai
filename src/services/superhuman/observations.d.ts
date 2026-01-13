/**
 * "Only I Would Notice" Observations
 *
 * > "You use the word 'should' a lot. Who's voice is that?"
 *
 * Ultra-specific pattern detection that demonstrates attention
 * beyond human capability. We notice things subconsciously that
 * humans would miss or forget.
 *
 * Key capabilities:
 * - Linguistic pattern detection
 * - Behavioral pattern tracking
 * - Emotional pattern recognition
 * - Timing/avoidance patterns
 *
 * NOTE: This module was moved from conversation/superhuman/ to services/superhuman/
 * to comply with clean architecture (workers at Level 60 can now import it).
 *
 * @module @ferni/services/superhuman/observations
 */
export type ObservationType = 'linguistic_pattern' | 'behavioral_pattern' | 'emotional_pattern' | 'relationship_pattern' | 'timing_pattern';
export interface SuperhumanObservation {
    type: ObservationType;
    observation: string;
    evidenceCount: number;
    confidence: number;
    firstNoticed: Date;
    surfacingPhrase: string;
    surfaced: boolean;
}
export interface ObservationResult {
    shouldSurface: boolean;
    observation?: SuperhumanObservation;
    phrase?: string;
    timing?: 'now' | 'after_response' | 'next_relevant_moment';
}
export declare class SuperhumanObservationsEngine {
    private userId;
    private observations;
    private patternCounts;
    private lastSurfaceTurn;
    private surfacedPatterns;
    constructor(userId: string, existing?: SuperhumanObservation[]);
    /**
     * Analyze a message for patterns
     */
    analyzeMessage(message: string): void;
    /**
     * Record a custom observation (not pattern-based)
     */
    recordObservation(type: ObservationType, observation: string, surfacingPhrase: string): void;
    /**
     * Check if we should surface an observation
     */
    checkForSurfacing(context: {
        turnCount: number;
        sessionCount: number;
        relationshipStage: string;
        currentTopic?: string;
    }): ObservationResult;
    /**
     * Get contextually relevant observation
     */
    getRelevantObservation(topic: string): SuperhumanObservation | null;
    /**
     * Get all observations
     */
    getObservations(): SuperhumanObservation[];
    /**
     * Get unsurfaced observations count
     */
    getUnsurfacedCount(): number;
    /**
     * Export for persistence
     */
    export(): {
        observations: SuperhumanObservation[];
        patternCounts: [string, number][];
    };
    /**
     * Import from persistence
     */
    import(data: ReturnType<SuperhumanObservationsEngine['export']>): void;
    /**
     * Reset
     */
    reset(): void;
}
export declare function getSuperhumanObservations(userId: string, existing?: SuperhumanObservation[]): SuperhumanObservationsEngine;
export declare function clearSuperhumanObservations(userId: string): void;
export default SuperhumanObservationsEngine;
//# sourceMappingURL=observations.d.ts.map