/**
 * Paradoxical Intervention Engine
 *
 * > "What would happen if you just... didn't try to fix it?"
 *
 * Knows when direct advice would backfire:
 *
 * - **Advice Resistance Detection**: Recognizing "yes, but" patterns
 * - **Paradoxical Questions**: Reverse psychology without manipulation
 * - **Indirect Approaches**: Asking instead of telling
 * - **Exploration Mode**: Help them discover rather than prescribe
 * - **Meta-Observation**: Point out the pattern without judging
 *
 * Sometimes the best way to help is to stop trying to help directly.
 *
 * @module @ferni/paradoxical-intervention
 */
export type ResistanceType = 'yes_but' | 'already_tried' | 'wont_work' | 'different' | 'deflection' | 'passive' | 'arguing' | 'overwhelmed';
export interface ResistanceDetection {
    /** Is resistance detected? */
    detected: boolean;
    /** Type of resistance */
    type: ResistanceType | null;
    /** Confidence (0-1) */
    confidence: number;
    /** Number of resistance instances this session */
    count: number;
    /** Evidence */
    evidence: string[];
}
export type InterventionType = 'paradoxical_question' | 'meta_observation' | 'explore_resistance' | 'validate_first' | 'ask_permission' | 'reverse_angle' | 'normalize_inaction' | 'gentle_curiosity';
export interface InterventionDecision {
    /** Should we intervene paradoxically? */
    shouldIntervene: boolean;
    /** Type of intervention */
    interventionType: InterventionType | null;
    /** Intervention phrase */
    phrase: string | null;
    /** Should we stop giving direct advice? */
    stopDirectAdvice: boolean;
    /** Reasoning */
    reasoning: string;
}
export interface AdviceHistory {
    turn: number;
    adviceGiven: string;
    response: 'accepted' | 'rejected' | 'deflected' | 'ignored';
}
export declare class ParadoxicalInterventionEngine {
    private resistanceHistory;
    private adviceHistory;
    private turnCount;
    private consecutiveResistances;
    private lastInterventionTurn;
    constructor();
    /**
     * Detect resistance to advice/suggestions in user message
     *
     * @param userMessage - User's message
     * @param turnCount - Current turn
     * @param wasAdviceJustGiven - Did agent just give advice?
     * @returns Resistance detection result
     */
    detectResistance(userMessage: string, turnCount: number, wasAdviceJustGiven?: boolean): ResistanceDetection;
    /**
     * Record advice given and response
     */
    recordAdviceResponse(turn: number, adviceGiven: string, response: AdviceHistory['response']): void;
    /**
     * Decide whether and how to intervene paradoxically
     *
     * @param resistance - Current resistance detection
     * @returns Intervention decision
     */
    decide(resistance: ResistanceDetection): InterventionDecision;
    /**
     * Get intervention phrase of specific type
     */
    getIntervention(type: InterventionType): string;
    /**
     * Get statistics
     */
    getStats(): {
        totalResistances: number;
        adviceRejectionRate: number;
        typeBreakdown: Record<ResistanceType, number>;
    };
    /**
     * Reset for new session
     */
    reset(): void;
}
export declare function getParadoxicalInterventionEngine(sessionId: string): ParadoxicalInterventionEngine;
export declare function resetParadoxicalInterventionEngine(sessionId: string): void;
export declare function clearParadoxicalInterventionEngine(sessionId: string): void;
export declare function getActiveParadoxicalInterventionCount(): number;
export default ParadoxicalInterventionEngine;
//# sourceMappingURL=paradoxical-intervention.d.ts.map