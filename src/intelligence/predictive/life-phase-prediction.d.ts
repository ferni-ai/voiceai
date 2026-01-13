/**
 * Life Phase Prediction - Better Than Human v4
 *
 * > "We see the season of your life, not just the day."
 *
 * SUPERHUMAN CAPABILITY: Predict personal "life seasons" independent
 * of the calendar - knowing when someone is in expansion, consolidation,
 * transition, or recovery.
 *
 * A therapist might recognize a life phase, but can't:
 * - Track patterns across months/years to predict the NEXT phase
 * - Know the typical duration of phases for THIS person
 * - Identify phase transition signals early
 * - Adjust support style for the current phase
 *
 * Life phases we track:
 * - Expansion: Taking on new challenges, growing
 * - Consolidation: Integrating recent growth, stabilizing
 * - Transition: Between chapters, identity shifting
 * - Recovery: Healing from something, rebuilding
 * - Plateau: Maintenance mode (not stagnation!)
 * - Emergence: Something new forming, not yet clear
 * - Integration: Making sense of changes
 * - Preparation: Building toward something
 *
 * @module intelligence/predictive/life-phase-prediction
 */
/** Life phases */
export type LifePhase = 'expansion' | 'consolidation' | 'transition' | 'recovery' | 'plateau' | 'emergence' | 'integration' | 'preparation' | 'crisis' | 'flowering';
/** Phase signals we track */
export type PhaseSignal = 'new_initiatives' | 'completion_focus' | 'reflection_increase' | 'future_planning' | 'routine_stability' | 'routine_disruption' | 'emotional_processing' | 'emotional_stability' | 'emotional_volatility' | 'hope_increase' | 'grief_presence' | 'excitement_increase' | 'energy_increase' | 'energy_decrease' | 'sustainable_pace' | 'overextension' | 'withdrawal' | 'learning_mode' | 'teaching_mode' | 'questioning_identity' | 'identity_clarity' | 'values_questioning' | 'values_clarity';
/** Phase observation */
export interface PhaseObservation {
    signal: PhaseSignal;
    strength: number;
    timestamp: number;
    context?: string;
}
/** Phase prediction */
export interface PhasePrediction {
    /** Current phase */
    currentPhase: LifePhase;
    /** Confidence in current phase detection */
    phaseConfidence: number;
    /** When current phase likely started */
    phaseStartEstimate: Date;
    /** Expected remaining duration */
    expectedDuration: {
        min: number;
        max: number;
        confidence: number;
    };
    /** Next phase prediction */
    nextPhase: {
        phase: LifePhase;
        probability: number;
        timing: 'soon' | 'weeks' | 'months' | 'unknown';
        triggers: string[];
    };
    /** Signals driving current assessment */
    activeSignals: Array<{
        signal: PhaseSignal;
        strength: number;
        contribution: number;
    }>;
    /** What they need in this phase */
    phaseNeeds: {
        support: string;
        avoid: string;
        focus: string;
        commonMistakes: string[];
    };
    /** Phase health */
    phaseHealth: {
        alignment: number;
        resistance: number;
        growth: number;
    };
}
/** Phase transition */
export interface PhaseTransition {
    fromPhase: LifePhase;
    toPhase: LifePhase;
    timestamp: number;
    duration: number;
    triggers: string[];
    smoothness: 'smooth' | 'turbulent' | 'gradual' | 'sudden';
}
/**
 * Record a phase signal observation
 *
 * @param userId - User ID
 * @param signal - What was observed
 * @param strength - Signal strength (0-1)
 * @param context - Optional context
 */
export declare function recordPhaseSignal(userId: string, signal: PhaseSignal, strength: number, context?: string): void;
/**
 * Record multiple signals from conversation analysis
 *
 * @param userId - User ID
 * @param analysis - Conversation analysis
 */
export declare function recordConversationPhaseSignals(userId: string, analysis: {
    newInitiatives?: number;
    reflectionLevel?: number;
    futureFocus?: number;
    emotionalVolatility?: number;
    energyLevel?: number;
    identityQuestioning?: boolean;
    valuesDiscussion?: boolean;
    griefPresent?: boolean;
    learningMentioned?: boolean;
    completionFocus?: boolean;
}): void;
/**
 * Manually set current phase (for calibration)
 *
 * @param userId - User ID
 * @param phase - Phase to set
 * @param reason - Why this phase
 */
export declare function setCurrentPhase(userId: string, phase: LifePhase, reason: string): void;
/**
 * Predict the current life phase
 *
 * @param userId - User ID
 * @returns Phase prediction
 */
export declare function predictPhase(userId: string): PhasePrediction | null;
/**
 * Get phase prediction summary
 *
 * @param userId - User ID
 * @returns Simplified phase info
 */
export declare function getPhaseInfo(userId: string): {
    phase: LifePhase;
    confidence: number;
    daysInPhase: number;
    summary: string;
} | null;
/**
 * Build life phase context for LLM injection
 *
 * @param userId - User ID
 * @returns Context string for prompt injection
 */
export declare function buildPhaseContext(userId: string): string;
export declare const lifePhasePrediction: {
    recordPhaseSignal: typeof recordPhaseSignal;
    recordConversationPhaseSignals: typeof recordConversationPhaseSignals;
    setCurrentPhase: typeof setCurrentPhase;
    predictPhase: typeof predictPhase;
    getPhaseInfo: typeof getPhaseInfo;
    buildPhaseContext: typeof buildPhaseContext;
};
export default lifePhasePrediction;
//# sourceMappingURL=life-phase-prediction.d.ts.map